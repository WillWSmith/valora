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

const YAHOO_BOOTSTRAP_URL = 'https://fc.yahoo.com';
const YAHOO_CRUMB_URL = 'https://query1.finance.yahoo.com/v1/test/getcrumb';
const YAHOO_QUOTE_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

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
  console.log('[YahooSession] Refreshing Yahoo Finance session');
  let collectedCookies = [];
  let crumbText = '';

  try {
    const bootstrap = await fetch(YAHOO_BOOTSTRAP_URL, { headers: YAHOO_REQUEST_HEADERS });
    console.log(
      `[YahooSession] Bootstrap response: ${bootstrap.status} ${bootstrap.statusText}`
    );
    const bootstrapCookies = extractCookies(bootstrap.headers);
    if (bootstrapCookies.length) {
      collectedCookies = bootstrapCookies;
    }
  } catch (err) {
    console.warn('[YahooSession] Failed to load bootstrap cookies', err);
  }

  try {
    const cookieHeader = buildCookieHeader(collectedCookies);
    const crumbHeaders = cookieHeader
      ? { ...YAHOO_REQUEST_HEADERS, Cookie: cookieHeader }
      : { ...YAHOO_REQUEST_HEADERS };
    const crumbResp = await fetch(YAHOO_CRUMB_URL, { headers: crumbHeaders });
    console.log(
      `[YahooSession] Crumb response: ${crumbResp.status} ${crumbResp.statusText}`
    );
    const crumbCookies = extractCookies(crumbResp.headers);
    if (crumbCookies.length) {
      collectedCookies = crumbCookies;
    }
    if (crumbResp.ok) {
      crumbText = (await crumbResp.text()).trim();
    }
    if (!crumbText) {
      console.warn('[YahooSession] Crumb endpoint returned no crumb; proceeding without it');
    }
  } catch (err) {
    console.warn('[YahooSession] Failed to refresh crumb; continuing with cookies only', err);
  }

  yahooSession.crumb = crumbText || null;
  yahooSession.cookie = buildCookieHeader(collectedCookies);
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

async function fetchYahooQuoteViaHttp(symbol, attempt = 0, hostIndex = 0) {
  const session = await getYahooSession(attempt > 0);
  const crumb = session.crumb;
  if (!crumb) {
    console.warn(
      `[YahooQuote] Crumb unavailable${attempt > 0 ? ' after refresh' : ''}, continuing without crumb parameter`
    );
  }
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
  const host = YAHOO_QUOTE_HOSTS[hostIndex] || YAHOO_QUOTE_HOSTS[0];
  const url = `https://${host}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}${crumbParam}`;
  const headers = session.cookie
    ? { ...YAHOO_REQUEST_HEADERS, Cookie: session.cookie }
    : { ...YAHOO_REQUEST_HEADERS };
  console.log(`[YahooQuote] Fetching ${symbol.toUpperCase()} (attempt ${attempt + 1})`);
  let resp;
  try {
    resp = await fetch(url, { headers });
  } catch (err) {
    console.warn(
      `[YahooQuote] Network error when calling ${host} for ${symbol.toUpperCase()}:`,
      err
    );
    if (attempt < 2) {
      await refreshYahooSession();
      return fetchYahooQuoteViaHttp(symbol, attempt + 1, hostIndex);
    }
    if (hostIndex + 1 < YAHOO_QUOTE_HOSTS.length) {
      console.warn(
        `[YahooQuote] Switching host to ${YAHOO_QUOTE_HOSTS[hostIndex + 1]} after network failure`
      );
      return fetchYahooQuoteViaHttp(symbol, attempt, hostIndex + 1);
    }
    throw err;
  }
  console.log(
    `[YahooQuote] Response ${resp.status} ${resp.statusText} for ${symbol.toUpperCase()} (attempt ${attempt + 1})`
  );
  if ((resp.status === 401 || resp.status === 403) && attempt < 2) {
    await refreshYahooSession();
    return fetchYahooQuoteViaHttp(symbol, attempt + 1, hostIndex);
  }
  if (resp.status >= 500 && hostIndex + 1 < YAHOO_QUOTE_HOSTS.length) {
    console.warn(
      `[YahooQuote] Host ${host} returned ${resp.status}; retrying via ${YAHOO_QUOTE_HOSTS[hostIndex + 1]}`
    );
    return fetchYahooQuoteViaHttp(symbol, attempt, hostIndex + 1);
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
    return res.status(502).json({
      error: 'Failed to fetch quote',
      details: error?.message || 'Unknown error when contacting Yahoo Finance'
    });
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