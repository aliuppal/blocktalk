import { runDailyScrape } from '../../lib/scrape.js';

// Triggered once a day by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` when that env var is set.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.authorization === `Bearer ${secret}`
    : String(req.headers['user-agent'] ?? '').startsWith('vercel-cron');
  if (!authorized) return res.status(401).json({ error: 'unauthorized' });

  try {
    const result = await runDailyScrape();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('daily scrape failed', err);
    res.status(500).json({ ok: false, error: 'scrape failed' });
  }
}
