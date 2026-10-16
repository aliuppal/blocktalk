// Collects today's facts from the live BlockTalk APIs into one JSON brief.
// The blog routine writes ONLY from this file, so every number in a post is
// traceable to a real source. Usage: node scripts/market-brief.js > brief.json
const BASE = process.env.BLOCKTALK_URL || 'https://www.blocktalk.website';

async function get(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return await r.json();
  } catch (err) {
    console.error(`warn: ${err.message}`);
    return null;
  }
}

const [news, prices, onchain, movers] = await Promise.all([get('/api/news'), get('/api/prices'), get('/api/onchain'), get('/api/movers')]);
const now = new Date();
const pick = (c) => c && ({ symbol: c.symbol, name: c.name, price: c.price, change1h: +c.change1h?.toFixed(2), change24h: +c.change24h?.toFixed(2) });

const brief = {
  generated_at: now.toISOString(),
  date_et: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
  sources: 'CoinGecko (prices, movers), alternative.me (Fear & Greed), ultrasound.money (ETH burn), L2BEAT (L2 TPS), mempool.space (BTC network), 12 crypto newsrooms via BlockTalk',
  prices: prices?.coins?.map((c) => ({ symbol: c.symbol, price: c.price, change24h: +c.change24h?.toFixed(2) })) ?? null,
  market_cap_usd: prices?.marketCap ?? null,
  market_cap_change24h: prices?.marketCapChange24h != null ? +prices.marketCapChange24h.toFixed(2) : null,
  fear_greed: onchain?.fng ?? null,
  eth_burn_24h: onchain?.ethBurn ? { eth: +onchain.ethBurn.d1Eth.toFixed(1), vs_7d_avg_pct: +(((onchain.ethBurn.d1Eth - onchain.ethBurn.avg7Eth) / onchain.ethBurn.avg7Eth) * 100).toFixed(1) } : null,
  l2_tps: onchain?.l2 ? { tps: Math.round(onchain.l2.tps), vs_7d_avg_pct: +(((onchain.l2.tps - onchain.l2.avg7Tps) / onchain.l2.avg7Tps) * 100).toFixed(1) } : null,
  btc_network: onchain?.btc ? { hashrate_zh: +(onchain.btc.hashrate / 1e21).toFixed(2), next_difficulty_change_pct: +onchain.btc.diffChange.toFixed(1), next_block_fee_sat_vb: onchain.btc.fastestFee } : null,
  // Ranked by momentum (24h change + 2x last hour), so a coin can be "strongest" while still red on 24h. Report the real % changes.
  movers: movers ? { method: 'momentum = 24h change + 2x last-hour change, top 100 coins by market cap', strongest_momentum: movers.gainers.map(pick), weakest_momentum: movers.losers.map(pick) } : null,
  trending: news?.trending ?? [],
  top_stories: (news?.stories ?? []).slice(0, 12).map((s) => ({
    title: s.title, url: s.url, source: s.source, published_at: s.published_at, tag: s.tag, outlets_covering: s.coverage,
    also: (s.also ?? []).map((a) => ({ source: a.source, url: a.url })),
  })),
};

process.stdout.write(JSON.stringify(brief, null, 2) + '\n');
