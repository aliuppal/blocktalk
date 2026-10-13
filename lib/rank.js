// Ranking: authority of the outlet + how many *other* outlets ran the same
// story + freshness + how hot the topic is across today's whole news cycle.

const STOP = new Set(`the a an and or but of to in on for with at by from as is are was were be been it its this that these those
into over after before amid about than then via vs new says say said could would will may might can just now more most
up down out off what why how who when where which while here there his her their our your has have had not no yes
week day today year report reports update news price prices crypto cryptocurrency token tokens coin coins market markets
billion million trillion trading first high low record ahead gets gains data`.split(/\s+/));

const ALIAS = { bitcoin: 'btc', bitcoins: 'btc', ethereum: 'eth', ether: 'eth', solana: 'sol', ripple: 'xrp', dogecoin: 'doge',
  cardano: 'ada', binance: 'bnb', tether: 'usdt', etfs: 'etf', stablecoins: 'stablecoin', regulators: 'regulator', 'u.s.': 'us' };

export function tokens(title) {
  const out = new Set();
  for (let w of title.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9.$]+/)) {
    w = w.replace(/^[.$]+|\.+$/g, '');
    w = ALIAS[w] ?? w;
    if ((w.length >= 3 || ['us', 'eu', 'uk'].includes(w)) && !STOP.has(w) && !/^[\d.]+$/.test(w)) out.add(w);
  }
  return out;
}

const CATEGORIES = [
  ['defi', 'DeFi', /\b(defi|dex|uniswap|aave|lending|liquidity|staking|restaking|yield|tvl|stablecoin\w*|lido|layer[- ]?2|l2|rollup\w*|bridge|amm|tokeni[sz]\w*|rwa|airdrop)\b/i],
  ['policy', 'Policy', /\b(sec|cftc|regulat\w*|laws?|bill|senate|congress|court|lawsuit|sued|tax\w*|bans?|banned|government|treasury|sanction\w*|policy|legal|mica|compliance|judge|doj|fbi|lawmaker\w*|legislat\w*)\b/i],
  ['markets', 'Markets', /\b(etf\w*|rall(y|ies)|surge\w*|plunge\w*|drops?|jumps?|gains?|soars?|slides?|tumbles?|climbs?|rebound\w*|trading|traders?|analyst\w*|liquidat\w*|inflow\w*|outflow\w*|bull\w*|bear\w*|all-time high|ath|price|futures|options)\b/i],
  ['top', 'Bitcoin', /\b(bitcoin|btc|miner\w*|mining|halving|lightning)\b/i],
  ['top', 'Ethereum', /\b(ethereum|eth|vitalik|pectra|fusaka)\b/i],
];
export function categorize(title) {
  for (const [kind, tag, re] of CATEGORIES) if (re.test(title)) return { kind, tag };
  return { kind: 'top', tag: 'Industry' };
}

function overlap(a, b) {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { shared, j: shared / (a.size + b.size - shared || 1) };
}

/**
 * @param {Array<{url,title,source_id,published_at}>} articles  recent window (e.g. last 7 days)
 * @param {Record<string, number>} weights  source_id -> authority 1..10
 */
export function rankArticles(articles, weights, now = Date.now()) {
  const toks = articles.map((a) => tokens(a.title));
  const times = articles.map((a) => Date.parse(a.published_at));

  // Same story across outlets: published within 48h of each other and sharing
  // enough key terms. Matching articles are joined into one story cluster.
  const parent = articles.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const coverage = articles.map((a, i) => {
    const others = new Set();
    articles.forEach((b, k) => {
      if (k === i || b.source_id === a.source_id) return;
      if (Math.abs(times[k] - times[i]) > 48 * 3600e3) return;
      const { shared, j } = overlap(toks[i], toks[k]);
      if (shared >= 3 && j >= 0.25) {
        others.add(b.source_id);
        parent[find(k)] = find(i);
      }
    });
    return others.size;
  });

  // Topic heat: terms that at least 3 distinct outlets used in the last 36h.
  const termSources = new Map();
  articles.forEach((a, i) => {
    if (now - times[i] > 36 * 3600e3) return;
    for (const t of toks[i]) {
      if (!termSources.has(t)) termSources.set(t, new Set());
      termSources.get(t).add(a.source_id);
    }
  });
  const heat = new Map([...termSources].map(([t, s]) => [t, s.size]).filter(([, n]) => n >= 3));
  const trending = [...heat].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([topic, outlets]) => ({ topic, outlets }));

  const scored = articles.map((a, i) => {
    const ageH = Math.max(0, (now - times[i]) / 3600e3);
    const authority = (weights[a.source_id] ?? 5) * 8;   // 40–80
    const freshness = 100 * Math.pow(0.5, ageH / 18);      // halves every 18h
    const cover = Math.min(coverage[i], 6) * 30;           // up to 180
    let h = 0;
    for (const t of toks[i]) h += heat.get(t) ?? 0;
    return { ...a, ...categorize(a.title), coverage: coverage[i] + 1, score: Math.round((authority + freshness + cover + Math.min(h, 40)) * 10) / 10 };
  });

  // Each cluster is keyed by its best-scoring article's URL; the feed shows
  // that one as the headline and the rest as "also covered by" links.
  const lead = new Map();
  scored.forEach((a, i) => {
    const root = find(i);
    if (!lead.has(root) || a.score > scored[lead.get(root)].score) lead.set(root, i);
  });
  scored.forEach((a, i) => { a.story_id = scored[lead.get(find(i))].url; });

  return { scored, trending };
}

// Outlets ranked by authority plus how many stories they placed in the top 50.
export function rankSources(sources, scored) {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 50);
  return sources
    .map((s) => {
      const inTop = top.filter((a) => a.source_id === s.id).length;
      return { ...s, articles: scored.filter((a) => a.source_id === s.id).length, in_top: inTop, source_score: s.weight * 10 + inTop * 4 };
    })
    .sort((a, b) => b.source_score - a.source_score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
