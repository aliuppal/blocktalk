// NY Open watchlist: the 5 strongest and 5 weakest coins in the top 100 by
// market cap, ranked by recent momentum. This describes what is already moving,
// not a forecast. Cached at the CDN for 5 minutes.
const SKIP = new Set([
  // stablecoins and fiat/gold-pegged tokens
  'usdt', 'usdc', 'dai', 'fdusd', 'usde', 'usds', 'tusd', 'pyusd', 'usdd', 'busd', 'frax', 'usd1', 'rlusd', 'susde', 'susds',
  'bsc-usd', 'usdtb', 'usd0', 'gho', 'lusd', 'eurc', 'buidl', 'xaut', 'paxg', 'usdf', 'usdg', 'usdx',
  // wrapped / liquid-staked versions that just mirror another coin
  'wbtc', 'weth', 'steth', 'wsteth', 'weeth', 'cbbtc', 'reth', 'jitosol', 'msol', 'lbtc', 'wbeth', 'cbeth', 'bnsol', 'meth',
  'solvbtc', 'clbtc', 'ezeth', 'rseth', 'tbtc', 'wbnb', 'wtrx', 'jupsol', 'oseth', 'lseth',
]);

export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=1h,24h', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    // Catches pegged tokens the list misses: sits near $1 and barely moves.
    const pegged = (c) => c.current_price > 0.95 && c.current_price < 1.05 && Math.abs(c.price_change_percentage_24h ?? 0) < 1.5;
    const coins = (await r.json())
      .filter((c) => !SKIP.has(c.symbol.toLowerCase()) && !pegged(c) && Number.isFinite(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h))
      .map((c) => {
        const change24h = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
        const change1h = c.price_change_percentage_1h_in_currency ?? 0;
        return {
          id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, image: c.image, price: c.current_price,
          change1h, change24h,
          // 24h trend, with the last hour weighted up so coins accelerating into the open rank higher.
          momentum: change24h + change1h * 2,
        };
      });
    const sorted = [...coins].sort((a, b) => b.momentum - a.momentum);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({
      updated_at: new Date().toISOString(),
      universe: coins.length,
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse(),
    });
  } catch (err) {
    console.error('movers failed', err.message);
    res.status(502).json({ error: 'movers unavailable' });
  }
}
