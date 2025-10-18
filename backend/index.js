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

/**
 * Quote endpoint.
 * Fetches basic quote data for a given ticker symbol from Yahoo Finance and computes a rudimentary Smart Score.
 * The score is currently a simple composite based on P/E and forward P/E; lower values result in higher scores.
 * In the future this logic should be replaced by the more comprehensive scoring algorithm described in docs/research.md.
 */
app.get('/api/quote', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol query parameter' });
  }
  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  // check cache first
  if (cache.has(yahooUrl)) {
    const cached = cache.get(yahooUrl);
    return res.json(cached);
  }
  try {
    const resp = await fetch(yahooUrl);
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Yahoo Finance responded with status ${resp.status}` });
    }
    const json = await resp.json();
    const result = json.quoteResponse && json.quoteResponse.result && json.quoteResponse.result[0];
    if (!result) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    const price = result.regularMarketPrice;
    const pe = result.trailingPE;
    const forwardPE = result.forwardPE;
    // simple score: invert P/E values to create higher scores for lower P/E, clamp between 0 and 100
    let score = 50;
    if (typeof pe === 'number' && typeof forwardPE === 'number') {
      // avoid division by zero; cap extremes
      const invPE = 1 / Math.max(pe, 0.0001);
      const invForwardPE = 1 / Math.max(forwardPE, 0.0001);
      // normalize to [0, 1] roughly by scaling
      const composite = invPE + invForwardPE;
      score = Math.min(100, Math.max(0, composite * 10));
    }
    const responseData = { symbol: result.symbol, price, pe, forwardPE, score };
    // cache the response
    cache.set(yahooUrl, responseData);
    return res.json(responseData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch quote' });
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