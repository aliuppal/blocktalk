import { sql } from '../lib/db.js';

const MAX_STORIES = 60;

// Ranked feed for the homepage: one entry per story, headline from the
// best-scoring outlet, plus links to every other outlet that covered it.
// Data only changes once a day, so the CDN caches it.
export default async function handler(req, res) {
  try {
    const db = sql();
    const rows = async (days) => db`
      select a.url, a.title, a.summary, a.image, a.published_at, a.kind, a.tag, a.coverage, a.score,
             coalesce(a.story_id, a.url) as story_id, s.id as source_id, s.name as source, s.domain, s.rank as source_rank
      from articles a join sources s on s.id = a.source_id
      where a.published_at > now() - make_interval(days => ${days})
      order by a.score desc`;
    let articles = await rows(3);
    if (articles.length < 30) articles = await rows(7);

    const stories = new Map();
    for (const a of articles) {
      const story = stories.get(a.story_id);
      if (!story) stories.set(a.story_id, { ...a, also: [] });
      else if (story.source_id !== a.source_id && !story.also.some((x) => x.source_id === a.source_id)) {
        story.also.push({ source_id: a.source_id, source: a.source, domain: a.domain, url: a.url });
      }
    }

    const sources = await db`
      select id, name, domain, homepage, weight, rank, source_score, articles, in_top, last_fetched, last_error
      from sources order by rank nulls last, weight desc`;
    const [run] = await db`select ran_at, trending from scrape_runs order by ran_at desc limit 1`;

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    res.status(200).json({
      updated_at: run?.ran_at ?? null,
      trending: run?.trending ?? [],
      sources,
      stories: [...stories.values()].slice(0, MAX_STORIES),
    });
  } catch (err) {
    console.error('news api failed', err);
    res.status(500).json({ error: 'could not load news' });
  }
}
