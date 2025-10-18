# Data Sources for Valora

Valora uses only free and publicly available data.  This document lists the primary data providers, the endpoints we plan to use, and their usage limitations.  Because the project must remain within free tiers and respect terms of service, we avoid scraping pages that explicitly prohibit automated access.  All client‑side requests will go through a server‑side proxy to shield API keys and handle rate limiting.

## Yahoo Finance (Unofficial)

**Overview:**  Yahoo Finance no longer offers an official API — Yahoo shut down its public API in 2017【938883160556103†L83-L85】.  Several unofficial libraries (e.g., `yahoo-finance2`, `yfinance`, `yahooquery`) scrape or call internal JSON endpoints to retrieve quotes, fundamentals, options data and analyst estimates.  These libraries are popular because they provide broad coverage without requiring API keys and can be used freely【938883160556103†L90-L100】.  However, they are not endorsed by Yahoo and may break if Yahoo changes its website【938883160556103†L126-L148】.  High‑frequency requests may lead to temporary blocking【938883160556103†L141-L148】.

**Key endpoints (via `yahoo-finance2` library):**

| Category | Endpoint & Description |
|---------|----------------------|
| **Quote/summary** | `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=defaultKeyStatistics,financialData,calendarEvents,summaryDetail` – returns price, market cap, dividends, P/E, PEG ratio, beta, revenue/earnings forecasts and other summary data for a single ticker. |
| **Historical price** | `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={period}&interval={interval}` – provides historical price and volume data for charts. |
| **Time series (fundamentals)** | `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=incomeStatementHistoryQuarterly,balanceSheetHistoryQuarterly,cashflowStatementHistoryQuarterly` – returns quarterly financial statements used to compute margins, ROE and leverage. |
| **Analyst recommendation trend** | `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=recommendationTrend` – provides analyst buy/hold/sell recommendations. |
| **Earnings calendar** | `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=calendarEvents` – yields upcoming earnings dates and dividend pay dates. |

**Limitations:**

* No official service guarantees.  Endpoints are undocumented and may change or break【938883160556103†L126-L148】.
* There is no published rate limit; however, making too many requests in a short period can trigger `429 Too Many Requests` responses or IP blocks.  We will throttle requests and cache results on the server.
* Some data (e.g., short interest, institutional holdings) may be available only via HTML pages; we avoid scraping pages requiring JavaScript or login and instead fall back to other providers.

## Alpha Vantage

**Overview:**  Alpha Vantage offers free JSON APIs for real‑time and historical market data, fundamentals and technical indicators.  A free API key is required.  According to Alpha Vantage’s documentation and third‑party tutorials, the free plan allows **500 API requests per day** and **5 requests per minute**【316077051461762†L44-L49】.  Exceeding these limits returns a message asking to slow down【316077051461762†L64-L71】.

**Key endpoints:**

| Category | Endpoint (Base URL: `https://www.alphavantage.co/query`) |
|---------|------------------------------------------------------------|
| **Global Quote** | `function=GLOBAL_QUOTE&symbol={symbol}&apikey={key}` – returns latest price, volume and previous close. |
| **Time Series Daily** | `function=TIME_SERIES_DAILY_ADJUSTED&symbol={symbol}&outputsize=compact&apikey={key}` – daily historical prices with adjustments for splits and dividends. |
| **Fundamental Overview** | `function=OVERVIEW&symbol={symbol}&apikey={key}` – provides P/E, PEG ratio, EPS, dividend yield, market cap and other fundamentals. |
| **Income Statement** | `function=INCOME_STATEMENT&symbol={symbol}&apikey={key}` – returns annual and quarterly income statements. |
| **Balance Sheet** | `function=BALANCE_SHEET&symbol={symbol}&apikey={key}` – returns annual and quarterly balance sheets. |
| **Cash Flow Statement** | `function=CASH_FLOW&symbol={symbol}&apikey={key}` – returns annual and quarterly cash flow statements. |
| **Earnings** | `function=EARNINGS&symbol={symbol}&apikey={key}` – returns quarterly and annual EPS data and analyst EPS forecasts. |

**Limitations & Notes:**

* Free plan: **5 requests per minute** and **500 requests per day**【316077051461762†L44-L49】.  We must implement back‑off delays (at least 12 seconds between calls) to stay within the per‑minute limit【316077051461762†L86-L97】.
* Data may be delayed and does not include some metrics (e.g., short interest, insider ownership).  We will use Alpha Vantage primarily as a fallback for price, earnings and basic fundamental data when Yahoo Finance is unavailable.

## Financial Modeling Prep (FMP)

**Overview:**  Financial Modeling Prep provides financial statements, market data, insider and institutional holdings, and various metrics.  FMP offers a free plan that allows up to **250 market data API requests per day**【3619569799188†L270-L274】.  A free API key is required.  Paid tiers unlock higher limits and additional datasets; we will use only free endpoints.

**Key endpoints (base URL `https://financialmodelingprep.com/api/v3/`):**

| Category | Endpoint & Description |
|---------|----------------------|
| **Quote** | `/quote/{symbol}` – real‑time price, volume, price changes and market cap. |
| **Key Metrics** | `/key-metrics/{symbol}` – returns valuation ratios such as P/E, P/B, PEG, ROIC, EBITDA margin and debt/equity. |
| **Financial Statements** | `/income-statement/{symbol}?period=annual` (or `quarter`) – provides detailed income statements; similar endpoints exist for `/balance-sheet-statement` and `/cash-flow-statement`. |
| **Financial Ratios** | `/ratios/{symbol}` – returns profitability, liquidity, leverage and efficiency ratios (e.g., gross margin, operating margin, net margin, ROE, ROA, debt ratios). |
| **Analyst Estimates** | `/analyst-estimates/{symbol}` – consensus EPS and revenue forecasts. |
| **Institutional & Insider Ownership** | `/institutional-holders/{symbol}` and `/insider-trading/{symbol}` – data on institutional holdings and insider transactions. |
| **Historical Price** | `/historical-price-full/{symbol}?serietype=line` – daily historical prices with adjustments. |

**Limitations & Notes:**

* The free plan allows **250 requests per day**【3619569799188†L270-L274】.  If we exceed this limit, FMP will return errors or throttle.  There is no explicit per‑minute limit, but some community sources mention an informal limit of around four requests per second; we will throttle accordingly.
* Some endpoints (e.g., analyst estimates, insider trades) may be limited or slightly delayed on the free tier; we will cache results to minimize repeated calls.
* Data coverage may vary across regions; FMP covers over 80,000 symbols globally, but smaller exchanges may lack certain fields.

## Additional & Secondary Sources

* **Short Interest & Ownership Data:**  FMP provides `/short-interest/{symbol}`, `/institutional-holders/{symbol}` and `/insider-trading/{symbol}` endpoints.  If these endpoints are unavailable or exceed free limits, we will set the short‑interest and ownership scores to a neutral value (50) in the composite score.
* **Beta Calculation:**  When beta is missing from APIs, we will compute it from historical daily returns using the formula `beta = covariance(stock, market) / variance(market)`【120308426466401†L412-L427】.  We will use a broad market index (e.g., S&P 500 or TSX Composite) as the benchmark.

## Proxy Server & Caching

All API requests from the React frontend will be routed through a Node/Express server deployed on **Render**.  The proxy serves three purposes:

1. **Protect API Keys:**  The frontend never exposes API keys.  The server uses environment variables to authenticate to Alpha Vantage and FMP and forwards requests without revealing secrets.
2. **Handle CORS:**  Many APIs do not allow client‑side cross‑origin requests.  The proxy fetches data and returns it with appropriate headers.
3. **Rate Limiting & LRU Cache:**  We will implement an LRU (least‑recently‑used) cache to store recent API responses.  For example, if the same ticker’s fundamental data is requested multiple times within a short period, the server will return the cached result instead of making a new API call.  This helps stay within free‑tier limits.  We will also queue requests and space them appropriately (e.g., wait at least 12 seconds between Alpha Vantage calls) to respect per‑minute limits【316077051461762†L86-L97】.

## Notes on Data Use & Terms of Service

* We will adhere to each provider’s Terms of Service.  The project is strictly for educational and personal use.  Users requiring high‑volume or commercial use should obtain their own API keys and verify licensing.
* Where required by the data source, we will include attribution (e.g., “Data provided by Financial Modeling Prep”).
* We avoid scraping pages that prohibit automated access; if a metric is unavailable via free APIs, we assign a neutral score rather than scrape restricted pages.

These data sources and practices ensure that Valora can operate at no cost while providing comprehensive financial metrics for the Smart Score.  Future enhancements may integrate additional free APIs if they remain compliant and within free usage limits.
