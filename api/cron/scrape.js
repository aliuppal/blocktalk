import { timingSafeEqual } from 'node:crypto';
import { sql } from '../../lib/db.js';
import { runDailyScrape } from '../../lib/scrape.js';

// One scrape per New York day, landing before the 9 AM blog routine.
// vercel.json fires at 11:45 and 12:45 UTC. On the Hobby plan Vercel starts crons
// late by an unpredictable amount (this project has seen ~35 min), so instead of
// demanding an exact hour, a scheduled call runs when:
//   - it is 7 AM or later in New York, and
//   - no scrape has run yet today (New York date).
// EDT: the 11:45 UTC slot lands ~7:45–8:44 AM and runs; the 12:45 slot then skips.
// EST: the 11:45 slot lands before 7 AM and skips; the 12:45 slot (~7:45–8:44) runs.
// Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
const EARLIEST_HOUR_NY = 7;
const nyHour = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d));
async function scrapedTodayNY() {
  const [row] = await sql()`select exists(
    select 1 from scrape_runs
    where (ran_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date) as done`;
  return row.done;
}

export default async function handler(req, res) {
  // Fail closed: without CRON_SECRET nothing can trigger a scrape (user-agents are spoofable).
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(String(req.headers.authorization ?? ''));
  const want = Buffer.from(`Bearer ${secret ?? ''}`);
  const authorized = Boolean(secret) && got.length === want.length && timingSafeEqual(got, want);
  if (!authorized) return res.status(401).json({ error: 'unauthorized' });

  // Scheduled calls carry ?slot=…; a manual call without it always runs.
  const scheduled = new URL(req.url, 'http://localhost').searchParams.has('slot');
  if (scheduled) {
    const hour = nyHour();
    if (hour < EARLIEST_HOUR_NY) {
      return res.status(200).json({ ok: true, skipped: true, reason: `New York hour is ${hour}; runs from ${EARLIEST_HOUR_NY} AM` });
    }
    if (await scrapedTodayNY()) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'already scraped today (New York date)' });
    }
  }

  try {
    const result = await runDailyScrape();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('daily scrape failed', err);
    res.status(500).json({ ok: false, error: 'scrape failed' });
  }
}
