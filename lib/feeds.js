import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: true, htmlEntities: true });
const UA = 'Mozilla/5.0 (compatible; BlockTalkBot/1.0; +https://www.blocktalk.website)';
const MAX_PER_SOURCE = 30;

const text = (v) => (v == null ? '' : typeof v === 'object' ? text(v['#text'] ?? '') : String(v));
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
function clean(s) {
  return text(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function linkOf(item) {
  for (const l of arr(item.link)) {
    if (typeof l === 'string') return l.trim();
    if (l?.['@href'] && (!l['@rel'] || l['@rel'] === 'alternate')) return l['@href'].trim();
  }
  const guid = text(item.guid);
  return /^https?:\/\//.test(guid) ? guid.trim() : '';
}

function imageOf(item) {
  const cands = [...arr(item['media:content']), ...arr(item['media:thumbnail']), ...arr(item.enclosure)];
  for (const c of cands) {
    const url = c?.['@url'];
    if (url && /^https:\/\//.test(url) && (!c['@type'] || c['@type'].startsWith('image'))) return url;
  }
  return null;
}

// Strip tracking params so the same story from one source dedupes cleanly.
function canonical(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return '';
    [...u.searchParams.keys()].filter((k) => /^(utm_|ref$|source$)/i.test(k)).forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}

export async function fetchSource(source, { timeoutMs = 12000 } = {}) {
  const res = await fetch(source.feed, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item;
  const now = Date.now();
  return arr(items).slice(0, MAX_PER_SOURCE).map((item) => {
    const url = canonical(linkOf(item));
    const title = clean(item.title);
    const when = Date.parse(text(item.pubDate || item.published || item.updated || item['dc:date']));
    return {
      url,
      title,
      summary: clean(item.description || item.summary || item['content:encoded']).slice(0, 280),
      image: imageOf(item),
      source_id: source.id,
      // Never trust future dates from feeds.
      published_at: new Date(Number.isFinite(when) ? Math.min(when, now) : now).toISOString(),
    };
  }).filter((a) => a.url && a.title);
}
