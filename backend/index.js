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

const YAHOO_QUOTE_SUMMARY_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

function buildQuoteSummaryUrl(host, symbol) {
  const encodedSymbol = encodeURIComponent(symbol);
  return `https://${host}/v10/finance/quoteSummary/${encodedSymbol}?modules=price%2CsummaryDetail`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchYahooQuoteSummary(symbol, attempt = 0, hostIndex = 0) {
  const host = YAHOO_QUOTE_SUMMARY_HOSTS[hostIndex] || YAHOO_QUOTE_SUMMARY_HOSTS[0];
  const url = buildQuoteSummaryUrl(host, symbol);
  console.log(
    `[YahooQuote] Fetching summary for ${symbol.toUpperCase()} via ${host} (attempt ${attempt + 1})`
  );

  let resp;
  try {
    resp = await fetch(url, { headers: YAHOO_REQUEST_HEADERS });
  } catch (err) {
    console.warn(
      `[YahooQuote] Network error when calling ${host} for ${symbol.toUpperCase()}:`,
      err
    );
    if (attempt < 2) {
      return fetchYahooQuoteSummary(symbol, attempt + 1, hostIndex);
    }
    if (hostIndex + 1 < YAHOO_QUOTE_SUMMARY_HOSTS.length) {
      console.warn(
        `[YahooQuote] Switching host to ${YAHOO_QUOTE_SUMMARY_HOSTS[hostIndex + 1]} after network failure`
      );
      return fetchYahooQuoteSummary(symbol, attempt, hostIndex + 1);
    }
    throw err;
  }

  const bodyText = await resp.text();
  console.log(
    `[YahooQuote] Response ${resp.status} ${resp.statusText} for ${symbol.toUpperCase()} (attempt ${attempt + 1})`
  );

  if (resp.status === 404) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    const parseError = new Error(
      `Unexpected payload from Yahoo Finance for ${symbol.toUpperCase()}: ${bodyText.slice(0, 200)}`
    );
    parseError.status = resp.status;
    throw parseError;
  }

  if (resp.status === 429 && attempt < 3) {
    const backoff = 250 * (attempt + 1);
    console.warn(
      `[YahooQuote] Rate limited when calling ${host} for ${symbol.toUpperCase()}; retrying after ${backoff}ms`
    );
    await wait(backoff);
    return fetchYahooQuoteSummary(symbol, attempt + 1, hostIndex);
  }

  if (resp.status >= 500) {
    if (hostIndex + 1 < YAHOO_QUOTE_SUMMARY_HOSTS.length) {
      console.warn(
        `[YahooQuote] Host ${host} returned ${resp.status}; retrying via ${YAHOO_QUOTE_SUMMARY_HOSTS[hostIndex + 1]}`
      );
      return fetchYahooQuoteSummary(symbol, attempt, hostIndex + 1);
    }
    if (attempt < 3) {
      const backoff = 300 * (attempt + 1);
      console.warn(
        `[YahooQuote] Host ${host} returned ${resp.status}; retrying after ${backoff}ms`
      );
      await wait(backoff);
      return fetchYahooQuoteSummary(symbol, attempt + 1, hostIndex);
    }
  }

  if (!resp.ok) {
    const error = new Error(`Yahoo Finance responded with status ${resp.status}: ${bodyText}`);
    error.status = resp.status;
    error.body = bodyText;
    throw error;
  }

  const summary = payload?.quoteSummary;
  const result = summary?.result?.[0];
  if (!result) {
    if (summary?.error?.code === 'Not Found') {
      return null;
    }
    const error = new Error(
      `Yahoo Finance did not return price data for ${symbol.toUpperCase()}: ${JSON.stringify(summary?.error)}`
    );
    error.status = 502;
    throw error;
  }

  const priceInfo = result.price || {};
  const detail = result.summaryDetail || {};
  const price = priceInfo.regularMarketPrice?.raw ?? priceInfo.regularMarketPrice;
  const trailingPE = detail.trailingPE?.raw ?? priceInfo.trailingPE?.raw ?? detail.trailingPE;
  const forwardPE = detail.forwardPE?.raw ?? priceInfo.forwardPE?.raw ?? detail.forwardPE;

  if (typeof price !== 'number') {
    const error = new Error(
      `Yahoo Finance response for ${symbol.toUpperCase()} lacked a numeric price: ${JSON.stringify(priceInfo)}`
    );
    error.status = 502;
    throw error;
  }

  return {
    symbol: (priceInfo.symbol || symbol || '').toUpperCase(),
    price,
    pe: typeof trailingPE === 'number' ? trailingPE : null,
    forwardPE: typeof forwardPE === 'number' ? forwardPE : null
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
  return await fetchYahooQuoteSummary(symbol.toUpperCase());
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