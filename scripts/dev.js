// Local preview without the Vercel CLI: `npm run dev` → http://localhost:3000
// Serves index.html and routes /api/* to the same handlers Vercel runs.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const routes = {
  '/api/news': () => import('../api/news.js'),
  '/api/prices': () => import('../api/prices.js'),
  '/api/onchain': () => import('../api/onchain.js'),
};

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (d) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); };
  if (routes[path]) return (await routes[path]()).default(req, res);
  if (path === '/' || path === '/index.html') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(await readFile(new URL('../index.html', import.meta.url)));
  }
  res.status(404).end('not found');
}).listen(process.env.PORT || 3000, () => console.log(`BlockTalk on http://localhost:${process.env.PORT || 3000}`));
