# Daily market summary: routine playbook

The Claude routine follows this file once a day. It writes a crypto market summary from live data,
renders a cover image, and submits both. Submitted posts are **published immediately** (no manual review), so
accuracy is on you: every fact must come from the brief. The owner can edit, hide or delete any post at
https://www.blocktalk.website/admin. (If the site sets BLOG_REQUIRE_REVIEW=true, posts wait there as drafts instead.)

Do not commit, push, or edit any files in the repository. Work in a temporary folder.

## 1. Gather facts

```bash
npm ci
node scripts/market-brief.js > brief.json
```

`brief.json` is the **only** source of facts. Every price, percentage, count and headline in the post must
appear in it. If a field is `null`, leave that topic out — never estimate or fill it in.

- `movers.strongest_momentum` / `weakest_momentum` are ranked by momentum (24h change + 2× last hour).
  A coin can be in "strongest" while its 24h change is negative. Always quote the real `change24h` and
  `change1h` and describe it accurately ("TIA leads with +26.2% over 24 hours", "BTW is down 3.5% on the day
  but up sharply in the last hour").
- `top_stories` are already ranked by how many outlets covered them. Cite the outlet by name and link the
  story `url`.

## 2. Write `draft.json`

```json
{
  "title": "...",
  "slug": "crypto-market-today-YYYY-MM-DD",
  "meta_description": "...",
  "keywords": ["crypto market today", "bitcoin price today", "..."],
  "excerpt": "...",
  "body_md": "...",
  "image_alt": "..."
}
```

### SEO rules (the API rejects drafts outside these limits)

| Field | Rule |
|---|---|
| `title` | 50–65 characters (hard limit 20–75). Starts with the primary keyword, includes the date, makes one claim. Pattern: `Crypto Market Today (Oct 16, 2026): Bitcoin Holds $82K as TIA Jumps 26%` |
| `slug` | `crypto-market-today-YYYY-MM-DD` (New York date). |
| `meta_description` | 140–160 characters (hard limit 70–170). Says what happened and why to read: BTC/ETH move, top gainer, mood. |
| `keywords` | 6–10 lowercase phrases people actually search: `crypto market today`, `bitcoin price today`, `ethereum price today`, `crypto news today`, `top crypto gainers today`, `crypto fear and greed index`, plus the day's coins/topics (`tia price`, `xrp news`). No duplicates. |
| `excerpt` | 1–2 sentences, 120–220 characters, for the blog cards. |
| `body_md` | 700–1,100 words of Markdown. |
| `image_alt` | Describes the cover: "BlockTalk daily crypto market summary for October 16, 2026: Bitcoin at $82,337, up 1.4%". |

### Body structure (use these H2s, in this order; no H1 — the page adds it)

1. `## Crypto market today: the summary` — 2-sentence answer first, then 3 bullets (BTC, ETH, the day's biggest move).
2. `## Bitcoin and Ethereum price today` — prices, 24h change, total market cap and its change.
3. `## Top crypto gainers and losers` — a Markdown table of the 5 strongest and 5 weakest (symbol, price, 1h, 24h), then 2–3 sentences of context.
4. `## Today's top crypto news` — the 4–6 most-covered stories. Each: what happened in one sentence, why it matters, and a link with descriptive anchor text to the original article (e.g. `[CoinDesk reports MSCI approved the new index rules](url)`). Mention how many outlets covered it.
5. `## On-chain data and market sentiment` — Fear & Greed (value, label, change vs yesterday), ETH burn vs 7-day average, L2 TPS, BTC hashrate and next difficulty change, BTC fees.
6. `## What to watch at the New York open` — 2–4 factual items drawn from the brief (momentum leaders, trending topics, scheduled items mentioned in stories). No price predictions or targets.
7. `## FAQ` — 2–3 questions phrased the way people search ("Why is crypto up today?", "What is the crypto Fear and Greed Index today?"), each answered in 1–3 sentences from the data.

End with: `*Data: CoinGecko, alternative.me, ultrasound.money, L2BEAT, mempool.space and 12 crypto newsrooms via [BlockTalk](/). Not financial advice.*`

### Writing rules

- Use the primary keyword in the title, the first sentence and one H2; then write naturally. No keyword stuffing.
- Link to BlockTalk at least twice: [today's ranked crypto news](/) and [all market summaries](/blog).
- Plain, confident sentences. Numbers formatted as `$82,337`, `+1.4%`, `$2.79T`.
- No invented quotes, analyst names, forecasts, price targets or "could reach" claims. No emoji.
- Never include raw HTML; Markdown only.

## 3. Render the cover

The cover is a single 1200×630 slide (one headline assertion, one hero number, a stat strip of real figures, one accent colour).
Pick a headline of **12 words or fewer** that states the day's main fact.

```bash
node scripts/blog-cover.js brief.json "Bitcoin holds $82K as altcoins lead a greedy market" cover.png
```

Open `cover.png` and check the headline fits on 2–3 lines and nothing overlaps. If rendering fails, submit without the cover and say so in the run summary.

## 4. Publish

Before submitting, re-read `draft.json` once against `brief.json`: every number, coin and outlet must match. The post goes live as soon as it is accepted.

```bash
BLOG_SECRET=<from the routine prompt> node scripts/blog-submit.js draft.json cover.png brief.json
```

On a 400 error, fix the field named in the message and resubmit. Finish with a one-paragraph summary:
the title, the slug, and the live URL the script prints (https://www.blocktalk.website/blog/<slug>).
