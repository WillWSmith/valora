import express from 'express';
import fetch from 'node-fetch';
import LRU from 'lru-cache';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

// simple in-memory LRU cache. max 100 entries, 5 minute TTL
const cache = new LRU({ max: 100, ttl: 1000 * 60 * 5 });

/**
 * Generic proxy endpoint. Frontend should provide the target URL via the `url` query parameter.
 * The server caches responses to stay within free API limits. If the cached response exists
 * and has not expired, it is returned immediately. Otherwise the server fetches the resource,
 * caches it and forwards it to the client. Note: In production you should validate and
 * whitelist URLs to avoid open proxy risks.
 */
app.get('/api/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }
  // check cache
  if (cache.has(target)) {
    return res.json(cache.get(target));
  }
  try {
    const response = await fetch(target);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream responded with status ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      cache.set(target, data);
      return res.json(data);
    }
    // for non-JSON responses, just proxy text
    const text = await response.text();
    cache.set(target, text);
    return res.send(text);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

// healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Valora backend running on port ${port}`);
});
