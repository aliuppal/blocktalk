import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getNews } from '../lib/news.js';
import { listPosts, getPost, getImage, renderMarkdown, readingMinutes, SITE } from '../lib/blog.js';

// Server-rendered pages (one function for Vercel Hobby's function limit).
// vercel.json rewrites map URLs to ?view=:
//   /                      home: ranked stories + latest blog posts in the HTML
//   /blog                  blog index          (view=blog)
//   /blog/:slug            blog post           (view=post)
//   /blog/:slug/cover.png  cover image from the base64 column (view=image)
//   /sitemap.xml           home + blog + posts (view=sitemap)
//   /admin                 review page for pending posts (view=admin, noindex)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
// JSON inside <script> must not be able to close the tag.
const BACKSLASH = String.fromCharCode(92);
const scriptJson = (v) => JSON.stringify(v).replace(/</g, BACKSLASH + "u003c");
const ldScript = (obj) => `<script type="application/ld+json">${scriptJson({ '@context': 'https://schema.org', ...obj })}</script>`;
const iso = (d) => new Date(d).toISOString();
const longDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
const PUBLISHER = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'BlockTalk', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } };

const templates = {};
const loadTpl = async (name) => (templates[name] ??= await readFile(path.join(process.cwd(), 'templates', name), 'utf8'));

// Google Analytics 4 (stream: www.blocktalk.website). The ID is public — it ships in every page — so it
// has a default; GA_MEASUREMENT_ID overrides it, and GA_MEASUREMENT_ID=off disables tracking.
const GA_DEFAULT = 'G-MG7SPYYVBQ';
function gaSnippet() {
  const id = String(process.env.GA_MEASUREMENT_ID || GA_DEFAULT).trim();
  if (!/^G-[A-Z0-9]{4,20}$/.test(id)) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`;
}
const tpl = async (name) => (await loadTpl(name)).replace('<!--SSR:GA-->', gaSnippet());

// ---------- home ----------
function feedHtml(stories) {
  return stories.map((s, i) => `<article class="story">
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <div class="body">
        <div class="badges"><span class="badge tag-${esc(s.tag)}">${esc(s.tag)}</span><time datetime="${esc(iso(s.published_at))}">${esc(new Date(s.published_at).toUTCString())}</time></div>
        <h2><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></h2>
        ${s.summary ? `<p class="summary">${esc(s.summary)}</p>` : ''}
        <div class="meta"><span class="m"><span class="src">${esc(s.source)}</span></span><span class="m"><b>${s.coverage} outlet${s.coverage > 1 ? 's' : ''}</b></span></div>
        ${s.also?.length ? `<div class="also"><small>ALSO ON</small>${s.also.map((a) => `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a>`).join('')}</div>` : ''}
      </div>
    </article>`).join('');
}

function homeJsonLd(data) {
  return ldScript({
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'BlockTalk', description: 'Crypto news from 12 newsrooms, merged by story and ranked daily.', inLanguage: 'en', publisher: { '@id': `${SITE}/#org` } },
      PUBLISHER,
      {
        '@type': 'ItemList', name: 'Top ranked crypto stories', ...(data.updated_at ? { dateModified: iso(data.updated_at) } : {}),
        itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: Math.min(data.stories.length, 20),
        itemListElement: data.stories.slice(0, 20).map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: safeUrl(s.url), name: s.title })),
      },
    ],
  });
}

async function home(res) {
  const html = await tpl('index.html');
  // Blog posts live only on /blog; the homepage links there from the nav.
  const news = await getNews().catch((err) => { console.error('page: news unavailable', err.message); return null; });
  let out = html;
  if (news?.stories?.length) {
    out = out
      .replace('<!--SSR:JSONLD-->', homeJsonLd(news))
      .replace('<!--SSR:FEED-->', feedHtml(news.stories))
      .replace('<!--SSR:DATA-->', `<script id="initial-news" type="application/json">${scriptJson(news)}</script>`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short CDN cache when the DB was down so a real render replaces the shell soon.
  res.setHeader('Cache-Control', news ? 'public, s-maxage=900, stale-while-revalidate=86400' : 'public, s-maxage=60');
  res.status(200).end(out);
}

// ---------- blog ----------
function head({ title, description, canonical, image, type = 'website', extra = '' }) {
  return `<title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="BlockTalk" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${image ? `<meta property="og:image" content="${esc(image)}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  ${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ''}
  ${extra}`;
}

async function blogIndex(res) {
  const posts = await listPosts({ limit: 50 });
  const canonical = `${SITE}/blog`;
  const main = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">BlockTalk</a> / <span>Blog</span></nav>
    <header class="blog-hero"><div class="eyebrow">Daily crypto market summary</div><h1>BlockTalk <mark>blog</mark></h1>
      <p class="lede">A daily read on the crypto market: what moved, why it moved, and the stories every outlet is covering, built from live prices, on-chain data and 12 newsrooms.</p></header>
    ${posts.length ? `<div class="post-list">${posts.map((p) => `<article class="post-card">
        <a href="/blog/${esc(p.slug)}">${p.has_image ? `<img src="/blog/${esc(p.slug)}/cover.png" alt="${esc(p.image_alt || p.title)}" width="1200" height="630" loading="lazy">` : ''}</a>
        <div><time datetime="${esc(iso(p.published_at))}">${esc(longDate(p.published_at))}</time>
        <h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt || p.meta_description)}</p></div>
      </article>`).join('')}</div>` : '<p class="empty">The first market summary is on its way.</p>'}`;
  const ld = ldScript({
    '@graph': [
      PUBLISHER,
      { '@type': 'Blog', '@id': `${canonical}#blog`, url: canonical, name: 'BlockTalk blog', publisher: { '@id': `${SITE}/#org` },
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: iso(p.published_at) })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'BlockTalk', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: canonical }] },
    ],
  });
  return sendBlog(res, head({ title: 'Daily Crypto Market Summary & Analysis | BlockTalk Blog', description: 'Daily crypto market summaries: Bitcoin and Ethereum price action, top gainers and losers, on-chain data and the most-covered crypto news.', canonical, extra: ld }), main);
}

async function blogPost(res, slug) {
  const p = slug && await getPost(slug);
  if (!p) return notFound(res);
  const canonical = `${SITE}/blog/${p.slug}`;
  const image = p.has_image ? `${canonical}/cover.png` : null;
  const main = `<article class="post">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">BlockTalk</a> / <a href="/blog">Blog</a> / <span>${esc(longDate(p.published_at))}</span></nav>
      <header><div class="eyebrow">Crypto market summary</div><h1>${esc(p.title)}</h1>
        <p class="post-meta">By BlockTalk · <time datetime="${esc(iso(p.published_at))}">${esc(longDate(p.published_at))}</time> · ${readingMinutes(p.body_md)} min read</p></header>
      ${image ? `<img class="cover" src="/blog/${esc(p.slug)}/cover.png" alt="${esc(p.image_alt || p.title)}" width="1200" height="630">` : ''}
      <div class="prose">${renderMarkdown(p.body_md)}</div>
      ${p.keywords?.length ? `<p class="tags">${p.keywords.map((k) => `<span>${esc(k)}</span>`).join('')}</p>` : ''}
      <p class="disclaimer">Market data from CoinGecko, alternative.me, ultrasound.money, L2BEAT and mempool.space. Not financial advice.</p>
      <p class="back"><a href="/">← Today’s ranked crypto news</a> · <a href="/blog">All market summaries</a></p>
    </article>`;
  const ld = ldScript({
    '@graph': [
      PUBLISHER,
      { '@type': 'BlogPosting', '@id': `${canonical}#post`, headline: p.title, description: p.meta_description, keywords: (p.keywords || []).join(', '),
        datePublished: iso(p.published_at), dateModified: iso(p.reviewed_at || p.published_at), mainEntityOfPage: canonical, url: canonical,
        ...(image ? { image: { '@type': 'ImageObject', url: image, width: 1200, height: 630 } } : {}),
        author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en', wordCount: String(p.body_md).split(/\s+/).length },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BlockTalk', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
        { '@type': 'ListItem', position: 3, name: p.title, item: canonical }] },
    ],
  });
  return sendBlog(res, head({ title: `${p.title} | BlockTalk`, description: p.meta_description, canonical, image, type: 'article',
    extra: `<meta property="article:published_time" content="${esc(iso(p.published_at))}" />${(p.keywords || []).map((k) => `<meta property="article:tag" content="${esc(k)}" />`).join('')}${ld}` }), main);
}

async function sendBlog(res, headHtml, mainHtml) {
  const html = (await tpl('blog.html')).replace('<!--SSR:HEAD-->', headHtml).replace('<!--SSR:MAIN-->', mainHtml);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).end(html);
}

async function notFound(res) {
  const html = (await tpl('blog.html'))
    .replace('<!--SSR:HEAD-->', '<title>Not found | BlockTalk</title><meta name="robots" content="noindex" />')
    .replace('<!--SSR:MAIN-->', '<article class="post"><h1>Post not found</h1><p class="back"><a href="/blog">← All market summaries</a></p></article>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).end(html);
}

async function coverImage(res, slug) {
  const img = slug && await getImage(slug);
  if (!img) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', img.mime);
  res.setHeader('Content-Length', img.bytes.length);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  res.status(200).end(img.bytes);
}

async function sitemap(res) {
  const posts = await listPosts({ limit: 1000 }).catch(() => []);
  const urls = [
    { loc: `${SITE}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE}/blog`, changefreq: 'daily', priority: '0.8', lastmod: posts[0]?.published_at },
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: p.reviewed_at || p.published_at, priority: '0.7' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) =>
    `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${iso(u.lastmod)}</lastmod>` : ''}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).end(xml);
}

async function admin(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).end(await loadTpl('admin.html'));
}

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const view = q.get('view');
  const slug = (q.get('slug') || '').replace(/[^a-z0-9-]/g, '');
  try {
    if (view === 'blog') return await blogIndex(res);
    if (view === 'post') return await blogPost(res, slug);
    if (view === 'image') return await coverImage(res, slug);
    if (view === 'sitemap') return await sitemap(res);
    if (view === 'admin') return await admin(res);
    return await home(res);
  } catch (err) {
    console.error('page failed', view, err);
    res.statusCode = 500;
    res.end('Something went wrong.');
  }
}
