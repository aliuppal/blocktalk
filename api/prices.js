// Live ticker data. CoinGecko is primary; Coinbase is the fallback for the
// majors if CoinGecko rate-limits. Cached at the CDN for 5 minutes.
const COINS = [
  ['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL'], ['ripple', 'XRP'], ['binancecoin', 'BNB'], ['dogecoin', 'DOGE'],
];
const get = (url) => fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });

async function fromCoinGecko() {
  const ids = COINS.map(([id]) => id).join(',');
  const [m, g] = await Promise.all([
    get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`),
    get('https://api.coingecko.com/api/v3/global'),
  ]);
  if (!m.ok) throw new Error(`coingecko ${m.status}`);
  const markets = await m.json();
  const global = g.ok ? (await g.json()).data : null;
  const byId = Object.fromEntries(markets.map((c) => [c.id, c]));
  return {
    provider: 'coingecko',
    coins: COINS.filter(([id]) => byId[id]).map(([id, symbol]) => ({ symbol, price: byId[id].current_price, change24h: byId[id].price_change_percentage_24h })),
    volume24h: global?.total_volume?.usd ?? null,
    marketCap: global?.total_market_cap?.usd ?? null,
    marketCapChange24h: global?.market_cap_change_percentage_24h_usd ?? null,
  };
}

async function fromCoinbase() {
  const coins = await Promise.all(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].map(async (symbol) => {
    const r = await get(`https://api.exchange.coinbase.com/products/${symbol}-USD/stats`);
    if (!r.ok) return null;
    const s = await r.json();
    const last = Number(s.last), open = Number(s.open);
    return { symbol, price: last, change24h: open ? ((last - open) / open) * 100 : 0 };
  }));
  if (!coins.some(Boolean)) throw new Error('coinbase returned nothing');
  return { provider: 'coinbase', coins: coins.filter(Boolean), volume24h: null, marketCap: null, marketCapChange24h: null };
}

export default async function handler(req, res) {
  let data;
  try { data = await fromCoinGecko(); } catch (err) {
    console.warn('coingecko failed, using coinbase', err.message);
    try { data = await fromCoinbase(); } catch { return res.status(502).json({ error: 'price providers unavailable' }); }
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ ...data, updated_at: new Date().toISOString() });
}
