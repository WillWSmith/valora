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

const YAHOO_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com'
};

const yahooSession = {
  crumb: null,
  cookie: null,
  expiresAt: 0
};

function extractCookies(headers) {
  if (!headers) {
    return [];
  }
  if (typeof headers.getSetCookie === 'function') {
    return headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .filter(Boolean);
  }
  if (typeof headers.raw === 'function') {
    const raw = headers.raw()?.['set-cookie'] || [];
    return raw.map((cookie) => cookie.split(';')[0]).filter(Boolean);
  }
  const header = headers.get?.('set-cookie');
  if (header) {
    return header
      .split(/,(?=[^,]+=)/)
      .map((cookie) => cookie.split(';')[0])
      .filter(Boolean);
  }
  return [];
}

function buildCookieHeader(cookies) {
  return cookies.length ? cookies.join('; ') : null;
}

async function refreshYahooSession() {
  const crumbUrl = 'https://query1.finance.yahoo.com/v1/test/getcrumb';

  console.log('[YahooSession] Refreshing Yahoo Finance session');
  let crumbText = '';
  let cookies = [];

  try {
    const firstAttempt = await fetch(crumbUrl, { headers: YAHOO_REQUEST_HEADERS });
    console.log(
      `[YahooSession] Initial crumb response: ${firstAttempt.status} ${firstAttempt.statusText}`
    );
    cookies = extractCookies(firstAttempt.headers);
    crumbText = firstAttempt.ok ? (await firstAttempt.text()).trim() : '';

    if (!crumbText) {
      const cookieHeader = buildCookieHeader(cookies);
      const retryHeaders = cookieHeader
        ? { ...YAHOO_REQUEST_HEADERS, Cookie: cookieHeader }
        : YAHOO_REQUEST_HEADERS;
      const retry = await fetch(crumbUrl, { headers: retryHeaders });
      console.log(`[YahooSession] Retry crumb response: ${retry.status} ${retry.statusText}`);
      const retryCookies = extractCookies(retry.headers);
      if (retryCookies.length) {
        cookies = retryCookies;
      }
      if (retry.ok) {
        crumbText = (await retry.text()).trim();
      }
      if (!crumbText) {
        console.warn('[YahooSession] Crumb endpoint responded without a crumb value');
      }
    }
  } catch (err) {
    console.warn('[YahooSession] Failed to refresh crumb, continuing without it', err);
  }

  yahooSession.crumb = crumbText || null;
  yahooSession.cookie = buildCookieHeader(cookies);
  yahooSession.expiresAt = Date.now() + 1000 * 60 * 30; // 30 minutes
  console.log('[YahooSession] Session refreshed', {
    hasCookie: Boolean(yahooSession.cookie),
    crumbLength: yahooSession.crumb?.length || 0,
    expiresAt: new Date(yahooSession.expiresAt).toISOString()
  });
  return yahooSession;
}

async function getYahooSession(forceRefresh = false) {
  if (!forceRefresh && yahooSession.crumb && yahooSession.expiresAt > Date.now()) {
    return yahooSession;
  }
  try {
    return await refreshYahooSession();
  } catch (err) {
    if (!forceRefresh && yahooSession.crumb) {
      // return existing session even if refresh fails so we can attempt the request
      return yahooSession;
    }
    throw err;
  }
}

async function fetchYahooQuoteViaHttp(symbol, attempt = 0) {
  const session = await getYahooSession(attempt > 0);
  const crumb = session.crumb;
  if (!crumb) {
    console.warn(
      `[YahooQuote] Crumb unavailable${attempt > 0 ? ' after refresh' : ''}, continuing without crumb parameter`
    );
  }
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}${crumbParam}`;
  const headers = session.cookie
    ? { ...YAHOO_REQUEST_HEADERS, Cookie: session.cookie }
    : { ...YAHOO_REQUEST_HEADERS };
  console.log(`[YahooQuote] Fetching ${symbol.toUpperCase()} (attempt ${attempt + 1})`);
  const resp = await fetch(url, { headers });
  console.log(
    `[YahooQuote] Response ${resp.status} ${resp.statusText} for ${symbol.toUpperCase()} (attempt ${attempt + 1})`
  );
  if ((resp.status === 401 || resp.status === 403) && attempt < 2) {
    await refreshYahooSession();
    return fetchYahooQuoteViaHttp(symbol, attempt + 1);
  }
  if (!resp.ok) {
    const errorBody = await resp.text();
    const error = new Error(`Yahoo Finance responded with status ${resp.status}: ${errorBody}`);
    error.status = resp.status;
    error.body = errorBody;
    throw error;
  }
  const json = await resp.json();
  const result = json.quoteResponse?.result?.[0];
  if (!result) {
    return null;
  }
  return {
    symbol: result.symbol,
    price: result.regularMarketPrice,
    pe: result.trailingPE,
    forwardPE: result.forwardPE
  };
}

function computeScore(pe, forwardPE) {
  let score = 50;
  if (typeof pe === 'number' && typeof forwardPE === 'number') {
    const invPE = 1 / Math.max(pe, 0.0001);
    const invForwardPE = 1 / Math.max(forwardPE, 0.0001);
    score = Math.min(100, Math.max(0, (invPE + invForwardPE) * 10));
  }
  return score;
}

async function fetchQuoteData(symbol) {
  return await fetchYahooQuoteViaHttp(symbol.toUpperCase());
}

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
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  // return cached response if available
  if (cache.has(cacheKey)) {
    console.log(`[Quote] Cache hit for ${symbol.toUpperCase()}`);
    return res.json(cache.get(cacheKey));
  }
  try {
    console.log(`[Quote] Fetching data for ${symbol.toUpperCase()}`);
    const quote = await fetchQuoteData(symbol);
    if (!quote) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    const score = computeScore(quote.pe, quote.forwardPE);
    const responseData = { ...quote, score };
    cache.set(cacheKey, responseData);
    console.log(`[Quote] Returning data for ${symbol.toUpperCase()}`);
    return res.json(responseData);
  } catch (error) {
    console.error(`[Quote] Error fetching data for ${symbol.toUpperCase()}:`, error);
    if (error?.status === 404) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    if (error?.status >= 400 && error?.status < 500) {
      return res.status(400).json({ error: 'Upstream rejected the request', details: error.message });
    }
    return res.status(502).json({ error: 'Failed to fetch quote' });
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