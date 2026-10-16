// "On-chain radar" sidebar data. Every metric comes from a free public API and
// is fetched independently, so one provider failing only blanks its own tile.
// Cached at the CDN for 15 minutes.
const get = async (url) => {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
};

// alternative.me Crypto Fear & Greed Index (updates once a day).
async function fearGreed() {
  const { data } = await get('https://api.alternative.me/fng/?limit=2');
  return { value: Number(data[0].value), label: data[0].value_classification, prev: data[1] ? Number(data[1].value) : null };
}

// ultrasound.money: ETH burned by EIP-1559 base fees.
async function ethBurn() {
  const d = await get('https://ultrasound.money/api/v2/fees/burn-sums');
  return { d1Eth: d.d1.sum.eth, d1Usd: d.d1.sum.usd, avg7Eth: d.d7.sum.eth / 7 };
}

// L2BEAT: daily transactions across all tracked L2s → average TPS.
async function l2Activity() {
  const { data } = await get('https://l2beat.com/api/scaling/activity');
  const rows = data.chart.data;                 // [timestamp, count, uopsCount]
  const last = rows[rows.length - 1];
  const week = rows.slice(-8, -1);
  const avg = week.reduce((s, r) => s + r[1], 0) / week.length;
  return { tps: last[1] / 86400, avg7Tps: avg / 86400, day: new Date(last[0] * 1000).toISOString().slice(0, 10) };
}

// mempool.space: Bitcoin hashrate, next difficulty adjustment, next-block fee.
async function bitcoin() {
  const [h, diff, fees] = await Promise.all([
    get('https://mempool.space/api/v1/mining/hashrate/3d'),
    get('https://mempool.space/api/v1/difficulty-adjustment'),
    get('https://mempool.space/api/v1/fees/recommended'),
  ]);
  return { hashrate: h.currentHashrate, diffChange: diff.difficultyChange, blocksToRetarget: diff.remainingBlocks, fastestFee: fees.fastestFee, hourFee: fees.hourFee };
}

export default async function handler(req, res) {
  const names = ['fng', 'ethBurn', 'l2', 'btc'];
  const results = await Promise.allSettled([fearGreed(), ethBurn(), l2Activity(), bitcoin()]);
  const body = { updated_at: new Date().toISOString() };
  results.forEach((r, i) => {
    body[names[i]] = r.status === 'fulfilled' ? r.value : null;
    if (r.status === 'rejected') console.warn(`onchain ${names[i]} failed:`, r.reason?.message);
  });
  if (results.every((r) => r.status === 'rejected')) return res.status(502).json({ error: 'on-chain providers unavailable' });
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(body);
}
