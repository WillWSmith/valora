import express from 'express';
import fetch from 'node-fetch';
import LRU from 'lru-cache';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const cache = new LRU({ max: 100, ttl: 1000 * 60 * 5 });

app.get('/api/proxy', async (req, res) => {
  const target = (req.query.url || '').toString();
  if (!target) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  if (cache.has(target)) {
    return res.json(cache.get(target));
  }

  try {
    const response = await fetch(target, { headers: BASE_HEADERS });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream responded with ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      cache.set(target, data);
      return res.json(data);
    }

    const text = await response.text();
    cache.set(target, text);
    return res.send(text);
  } catch (error) {
    console.error('[Proxy] Failed to fetch target url', error);
    res.status(502).json({ error: 'Failed to fetch resource' });
  }
});

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive'
};

const LANDING_HEADERS = {
  ...BASE_HEADERS,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
};

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const session = {
  cookie: null,
  crumb: null,
  expiresAt: 0
};

function parseCookies(rawCookies = []) {
  return rawCookies
    .map((entry) => entry.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function refreshSession() {
  try {
    console.log('[Yahoo] Refreshing session');
    const landingResp = await fetch('https://finance.yahoo.com/', {
      method: 'GET',
      headers: LANDING_HEADERS
    });

    if (!landingResp.ok) {
      console.warn(`[Yahoo] Landing request failed with status ${landingResp.status}`);
    }

    const landingCookies = landingResp.headers.raw()['set-cookie'] || [];
    session.cookie = parseCookies(landingCookies) || null;
    session.expiresAt = Date.now() + 1000 * 60 * 30;

    if (!session.cookie) {
      console.warn('[Yahoo] No cookies received from landing request');
      session.crumb = null;
      return;
    }

    const crumbResp = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      method: 'GET',
      headers: {
        ...BASE_HEADERS,
        Cookie: session.cookie
      }
    });

    if (!crumbResp.ok) {
      console.warn(`[Yahoo] Crumb request failed with status ${crumbResp.status}`);
      session.crumb = null;
      return;
    }

    const crumbText = (await crumbResp.text()).trim();
    session.crumb = crumbText || null;
    console.log(`[Yahoo] Session ready (crumb: ${session.crumb ? 'yes' : 'no'})`);
  } catch (error) {
    console.error('[Yahoo] Failed to refresh session', error);
    session.cookie = null;
    session.crumb = null;
    session.expiresAt = Date.now() + 1000 * 60 * 5;
  }
}

async function yahooFetch(host, path, { useCrumb = false, retry = true } = {}) {
  if (!session.cookie || session.expiresAt <= Date.now()) {
    await refreshSession();
  }

  const url = new URL(`https://${host}${path}`);
  if (useCrumb && session.crumb) {
    url.searchParams.set('crumb', session.crumb);
  }

  const headers = {
    ...BASE_HEADERS
  };
  if (session.cookie) {
    headers.Cookie = session.cookie;
  }

  const response = await fetch(url, { headers });

  if ((response.status === 401 || response.status === 403) && retry) {
    console.warn(`[Yahoo] ${response.status} received, refreshing session and retrying`);
    session.cookie = null;
    session.crumb = null;
    session.expiresAt = 0;
    await refreshSession();
    return yahooFetch(host, path, { useCrumb, retry: false });
  }

  return response;
}

async function fetchYahooQuote(symbol) {
  const encodedSymbol = encodeURIComponent(symbol);
  const path = `/v7/finance/quote?symbols=${encodedSymbol}`;
  let lastError;

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await yahooFetch(host, path, { useCrumb: true });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const body = await response.text();
        lastError = new Error(`Yahoo responded with ${response.status}: ${body}`);
        lastError.status = response.status;
        continue;
      }

      const payload = await response.json();
      const result = payload?.quoteResponse?.result?.[0];

      if (!result) {
        return null;
      }

      const price = result.regularMarketPrice;
      if (typeof price !== 'number') {
        throw new Error(`Invalid price data for ${symbol}`);
      }

      return {
        symbol: (result.symbol || symbol).toUpperCase(),
        price,
        pe: typeof result.trailingPE === 'number' ? result.trailingPE : null,
        forwardPE: typeof result.forwardPE === 'number' ? result.forwardPE : null
      };
    } catch (error) {
      lastError = error;
      console.warn(`[Yahoo] Error from host ${host} for ${symbol}:`, error);
    }
  }

  if (lastError) {
    lastError.status = lastError.status || 502;
    throw lastError;
  }

  const fallbackError = new Error('Yahoo Finance did not return data');
  fallbackError.status = 502;
  throw fallbackError;
}

function computeScore(pe, forwardPE) {
  if (typeof pe !== 'number' && typeof forwardPE !== 'number') {
    return 50;
  }

  const values = [];
  if (typeof pe === 'number' && pe > 0) {
    values.push(1 / pe);
  }
  if (typeof forwardPE === 'number' && forwardPE > 0) {
    values.push(1 / forwardPE);
  }

  if (values.length === 0) {
    return 50;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.max(0, Math.min(100, Math.round(average * 100)));
}

app.get('/api/quote', async (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim();
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol query parameter' });
  }

  const cacheKey = `quote:${symbol.toUpperCase()}`;
  if (cache.has(cacheKey)) {
    console.log(`[Quote] Cache hit for ${symbol.toUpperCase()}`);
    return res.json(cache.get(cacheKey));
  }

  try {
    const quote = await fetchYahooQuote(symbol);

    if (!quote) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    const score = computeScore(quote.pe, quote.forwardPE);
    const payload = { ...quote, score };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error(`[Quote] Failed to fetch data for ${symbol}:`, error);
    if (error?.status === 404) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    if (error?.status >= 400 && error?.status < 500) {
      return res.status(400).json({ error: 'Upstream rejected the request' });
    }
    res.status(502).json({ error: 'Failed to fetch quote' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Valora backend running on port ${port}`);
});
