import { timingSafeEqual } from 'node:crypto';
import { validateDraft, createDraft, listPosts, reviewPost, SITE } from '../lib/blog.js';

// Blog API (one function to stay inside Vercel Hobby's function limit):
//   POST ?action=submit   Bearer BLOG_SECRET   routine submits a draft → status 'pending'
//   GET  ?action=pending  Bearer ADMIN_SECRET  drafts waiting for review (with cover image)
//   POST ?action=review   Bearer ADMIN_SECRET  { id, decision: 'publish'|'reject', title?, meta_description?, body_md?, note? }
//   GET  ?action=list                          published posts (public)
function bearerMatches(req, secret) {
  if (!secret) return false;
  const got = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  const action = new URL(req.url, 'http://localhost').searchParams.get('action');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (action === 'list' && req.method === 'GET') {
      const posts = await listPosts({ status: 'published', limit: 30 });
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({ posts: posts.map((p) => ({ ...p, url: `${SITE}/blog/${p.slug}`, image: p.has_image ? `${SITE}/blog/${p.slug}/cover.png` : null })) });
    }

    if (action === 'submit' && req.method === 'POST') {
      if (!bearerMatches(req, process.env.BLOG_SECRET)) return res.status(401).json({ error: 'unauthorized' });
      let draft;
      try { draft = validateDraft(await readJson(req)); } catch (err) { return res.status(400).json({ error: err.message }); }
      const row = await createDraft(draft);
      return res.status(201).json({ ok: true, ...row, review_url: `${SITE}/admin` });
    }

    if (action === 'pending' && req.method === 'GET') {
      if (!bearerMatches(req, process.env.ADMIN_SECRET)) return res.status(401).json({ error: 'unauthorized' });
      const { sql } = await import('../lib/db.js');
      const rows = await sql()`select id, slug, title, meta_description, keywords, excerpt, body_md, image_base64, image_mime, image_alt, created_at
        from blog_posts where status = 'pending' order by created_at desc limit 20`;
      return res.status(200).json({ posts: rows });
    }

    if (action === 'review' && req.method === 'POST') {
      if (!bearerMatches(req, process.env.ADMIN_SECRET)) return res.status(401).json({ error: 'unauthorized' });
      const body = await readJson(req);
      try {
        const row = await reviewPost({ ...body, id: Number(body.id) });
        return res.status(200).json({ ok: true, ...row, url: row.status === 'published' ? `${SITE}/blog/${row.slug}` : null });
      } catch (err) { return res.status(400).json({ error: err.message }); }
    }

    return res.status(404).json({ error: 'unknown action' });
  } catch (err) {
    console.error('blog api failed', err);
    return res.status(500).json({ error: 'blog api failed' });
  }
}
