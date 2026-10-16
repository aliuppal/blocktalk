import { runDailyScrape } from '../../lib/scrape.js';

// Runs once a day at 9 AM New York time. Vercel Cron only speaks UTC and
// New York shifts between UTC-4 (EDT) and UTC-5 (EST), so vercel.json fires
// at both 13:00 and 14:00 UTC and the slot that isn't 9 AM there is skipped.
// Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
const RUN_HOUR_NY = 9;
const nyHour = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d));

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.authorization === `Bearer ${secret}`
    : String(req.headers['user-agent'] ?? '').startsWith('vercel-cron');
  if (!authorized) return res.status(401).json({ error: 'unauthorized' });

  // Scheduled calls carry ?slot=…; a manual call without it always runs.
  const scheduled = new URL(req.url, 'http://localhost').searchParams.has('slot');
  const hour = nyHour();
  if (scheduled && hour !== RUN_HOUR_NY) {
    return res.status(200).json({ ok: true, skipped: true, reason: `New York hour is ${hour}, runs at ${RUN_HOUR_NY}` });
  }

  try {
    const result = await runDailyScrape();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('daily scrape failed', err);
    res.status(500).json({ ok: false, error: 'scrape failed' });
  }
}
