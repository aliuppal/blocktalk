// Renders a 1200x630 blog cover (also the og:image) from the market brief.
// Built as a single slide: one headline assertion, one hero number, a stat
// strip of real figures, one accent colour on the site's dark grid.
// Usage: node scripts/blog-cover.js brief.json "Headline (<= 12 words)" cover.png
import { readFileSync, writeFileSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const [briefPath, headline, outPath = 'cover.png'] = process.argv.slice(2);
if (!briefPath || !headline) {
  console.error('usage: node scripts/blog-cover.js brief.json "Headline" cover.png');
  process.exit(1);
}
if (headline.split(/\s+/).length > 12) console.error('warn: headline is over 12 words; it may wrap to 4 lines');

const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (n) => (n == null ? '—' : n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);
const pct = (n) => (n == null ? '' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`);
const tone = (n) => (n == null ? '' : n >= 0 ? 'up' : 'down');

const coin = (sym) => brief.prices?.find((c) => c.symbol === sym);
const btc = coin('BTC'), eth = coin('ETH');
const fng = brief.fear_greed;
// Biggest 24h gainer among the momentum leaders (the list itself is momentum-ranked).
const top = [...(brief.movers?.strongest_momentum ?? [])].sort((a, b) => b.change24h - a.change24h)[0];
const stats = [
  eth && { label: 'ETH', value: usd(eth.price), sub: pct(eth.change24h), tone: tone(eth.change24h) },
  fng && { label: 'Fear & Greed', value: String(fng.value), sub: fng.label, tone: fng.value >= 55 ? 'up' : fng.value <= 45 ? 'down' : '' },
  top && { label: 'Top gainer', value: top.symbol, sub: pct(top.change24h), tone: tone(top.change24h) },
  brief.market_cap_usd && { label: 'Total market cap', value: `$${(brief.market_cap_usd / 1e12).toFixed(2)}T`, sub: pct(brief.market_cap_change24h), tone: tone(brief.market_cap_change24h) },
].filter(Boolean).slice(0, 4);

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0a0e0d;--panel:#111715;--line:#26302b;--text:#e7ece8;--muted:#8d9892;--dim:#5e6964;--accent:#4ade80;--down:#f87171;
    --display:'Space Grotesk',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace}
  *{box-sizing:border-box;margin:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{background:var(--bg);color:var(--text);font-family:var(--display);position:relative;
    background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:40px 40px}
  .slide{position:absolute;inset:56px 64px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font:700 17px var(--mono);letter-spacing:.08em}
  .brand{display:flex;align-items:center;gap:12px;color:var(--accent)}
  .mark{width:34px;height:34px;border-radius:8px;border:1.5px solid rgba(74,222,128,.5);background:rgba(74,222,128,.1);display:grid;place-items:center}
  .mark svg{width:18px;height:18px;stroke:var(--accent);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  .date{color:var(--muted)}
  .main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:48px;align-items:center}
  h1{font:700 54px/1.1 var(--display);letter-spacing:-.025em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
  .hero{border-left:1px solid var(--line);padding-left:40px}
  .hero small{display:block;font:700 15px var(--mono);letter-spacing:.1em;color:var(--muted);margin-bottom:10px}
  .hero b{display:block;font:700 64px/1 var(--display);letter-spacing:-.03em}
  .hero span{display:block;font:700 26px var(--mono);margin-top:12px}
  .strip{display:grid;grid-template-columns:repeat(${Math.max(stats.length, 1)},1fr);border-top:1px solid var(--line);padding-top:22px;gap:24px}
  .strip small{display:block;font:700 13px var(--mono);letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin-bottom:6px}
  .strip b{font:700 26px var(--display)}
  .strip span{font:700 16px var(--mono);margin-left:8px}
  .up{color:var(--accent)}.down{color:var(--down)}
</style></head><body><div class="slide">
  <div class="top"><span class="brand"><span class="mark"><svg viewBox="0 0 24 24"><path d="M5 7l5 5-5 5M12 18h7"/></svg></span>BLOCKTALK · DAILY MARKET SUMMARY</span><span class="date">${esc(brief.date_et || '')}</span></div>
  <div class="main">
    <h1>${esc(headline)}</h1>
    ${btc ? `<div class="hero"><small>BITCOIN</small><b>${usd(btc.price)}</b><span class="${tone(btc.change24h)}">${pct(btc.change24h)} 24h</span></div>` : '<div></div>'}
  </div>
  <div class="strip">${stats.map((s) => `<div><small>${esc(s.label)}</small><b>${esc(s.value)}</b><span class="${s.tone}">${esc(s.sub)}</span></div>`).join('')}</div>
</div></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'bt-cover-'));
const htmlPath = path.join(dir, 'cover.html');
writeFileSync(htmlPath, html);
const out = path.resolve(outPath);

// Playwright's CLI renders the slide; pinned version, Chromium installed on first use.
const PW = 'playwright@1.49.1';
const run = (args) => spawnSync('npx', ['-y', PW, ...args], { stdio: 'inherit', shell: process.platform === 'win32' });
if (!process.env.SKIP_BROWSER_INSTALL) run(['install', 'chromium']);
const shot = run(['screenshot', '--viewport-size=1200,630', '--wait-for-timeout=1500', pathToFileURL(htmlPath).href, out]);
if (shot.status !== 0 || !existsSync(out) || statSync(out).size < 1000) {
  console.error(`cover render failed; slide HTML kept at ${htmlPath}`);
  process.exit(1);
}
console.log(`cover written: ${out} (${statSync(out).size} bytes)`);
