# Valora Scoring Model – Research Summary

## Overview

Valora’s objective is to compute a **Smart Score** between 0 and 100 for any publicly traded company.  The score aggregates fundamental, growth, quality/financial‑health and sentiment/risk metrics into an intuitive indicator similar to Morningstar/StockPEG ratings.  Each sub‑score is calculated from publicly available data (primarily via free APIs) using a normalization approach inspired by industry factor models.  This document summarizes the research underpinning the metric selection, formulas, normalization, weighting and fallback strategy.

### Methodology Summary

* **Metric selection:**  We group indicators into four pillars — **Value**, **Growth**, **Financial Health/Quality**, and **Sentiment & Risk** — guided by academic literature and investment industry practice.  Metrics were selected for their interpretability, availability via free APIs and proven relevance to equity valuation (e.g., price‑earnings ratio, return on equity, leverage, insider ownership).  Each metric is defined below with a citation to a reputable source.
* **Normalization:**  Raw metrics often have different units and ranges.  To combine them, we standardize each variable using **winsorization** and **z‑score** scaling.  The MSCI Quality Index methodology recommends winsorizing variables by capping observations below the 5th percentile and above the 95th percentile, then computing z‑scores using the mean and standard deviation【292294796868569†L130-L154】.  Standardizing variables to z‑scores enables comparison across different scales and allows us to combine them fairly【292294796868569†L166-L170】.  A statistics primer explains that z‑scores convert data to a standard scale (mean = 0, standard deviation = 1) and allow comparison of dissimilar variables【825486509019026†L38-L44】【825486509019026†L114-L121】.
* **Converting to 0–100 scores:**  After computing z‑scores for each metric, we convert them to a percentile‑based 0‑100 scale.  In statistics, a percentile rank represents the percentage of observations below a given value【189339291081964†L154-L160】.  We map z‑scores to percentile ranks relative to our universe of companies and scale them to 0‑100 (0 = worst, 100 = best).  This makes the score intuitive and comparable across metrics.
* **Weighting:**  Each pillar contributes equally to the Smart Score to encourage balanced evaluation.  Within each pillar, metrics are weighted based on their importance and availability: metrics with broader coverage receive higher weight.  Where multiple metrics measure similar concepts (e.g., different profit margins), weights are adjusted to avoid overrepresentation.  Weight assignments can be tuned later based on empirical testing.
* **Fallbacks & missing data:**  When a metric is unavailable for a given company, we fall back to related metrics or assign a neutral score (e.g., 50) to avoid penalizing firms for missing data.  For example, if a company has no dividends, its **PEGY** ratio falls back to the standard **PEG** ratio.  We handle outliers by winsorizing as described above【292294796868569†L130-L154】 and by capping extremely negative z‑scores to a minimum percentile of 0.

## Value Metrics

| Metric | Definition & Formula | Relevance |
|-------|----------------------|-----------|
| **Price/Earnings (P/E)** | The ratio of share price to earnings per share (EPS); computed as **Price ÷ EPS**【629953652224997†L382-L394】. A high P/E implies investors expect higher future growth, while a low P/E may signal undervaluation【629953652224997†L382-L394】. | Provides a baseline valuation metric comparing price to profits.
| **Forward P/E** | Uses projected next‑year EPS instead of trailing EPS, offering a forward‑looking valuation.  Similar interpretation to P/E. | Anticipates future earnings growth or decline.
| **Price/Book (P/B)** | Stock price divided by book value per share【767887888341780†L308-L320】.  A ratio below 1 suggests the stock trades below its net asset value; above 1 indicates investors pay a premium to book value【767887888341780†L330-L340】. | Assesses how the market values a company’s net assets.
| **Price/Earnings‑to‑Growth (PEG)** | P/E ratio divided by projected earnings growth rate【629953652224997†L418-L423】.  Values below 1 may indicate an undervalued growth stock; values above 1 mean investors pay more for growth【629953652224997†L418-L425】. | Adjusts P/E for growth expectations.
| **Dividend Yield** | Annual dividends per share divided by the stock price【629953652224997†L445-L447】.  A higher yield indicates greater cash returned to shareholders. | Adds income component to valuation.
| **PEGY (Dividend‑Adjusted PEG)** | **PEGY = P/E ÷ (Earnings Growth Rate + Dividend Yield)**【572274945212186†L46-L62】.  Incorporates dividend yield to avoid penalizing high‑yield companies【572274945212186†L31-L44】.  A PEGY below 1 suggests the stock has attractive growth or dividend yield at its current price【572274945212186†L41-L44】. | Balances growth and yield for mature companies.
| **Price/Cash Flow** | Market capitalization divided by operating cash flow; used when earnings include non‑cash items.  | Reflects ability to generate cash.

## Growth Metrics

| Metric | Definition & Formula | Relevance |
|-------|----------------------|-----------|
| **EPS Growth (TTM and Forward)** | Year‑over‑year percentage change in earnings per share. EPS itself equals **(Net Income – Preferred Dividends) ÷ Weighted Average Shares**【716496448253529†L337-L369】. | Measures profitability growth; high growth signals expanding earnings.
| **Revenue Growth** | Year‑over‑year percentage change in total revenue. | Gauges top‑line expansion.
| **PEG & PEGY** | See Value section.  Serve as hybrid growth/valuation metrics by incorporating earnings growth rate and dividends【629953652224997†L418-L425】【572274945212186†L46-L62】. | Integrate growth into valuation.
| **Analyst Revenue & EPS Forecasts** | Consensus analyst estimates of future revenue and EPS. | Provide market expectations; used as forward‑growth proxies.

## Financial Health & Quality Metrics

| Metric | Definition & Formula | Relevance |
|-------|----------------------|-----------|
| **Return on Equity (ROE)** | Net income divided by shareholders’ equity【767887888341780†L273-L284】.  High ROE indicates efficient use of shareholders’ capital; it should be compared within an industry【767887888341780†L273-L284】. | Measures profitability per dollar of equity.
| **Return on Assets (ROA)** | Net income divided by total assets【497290599891037†L328-L346】.  Higher ROA means the company uses its assets efficiently【497290599891037†L328-L346】. | Evaluates overall asset efficiency.
| **Gross Margin** | Gross profit divided by revenue【261789689952120†L316-L320】. | Indicates production efficiency; higher margins show the company retains more revenue after cost of goods.
| **Operating Margin** | Operating profit divided by revenue【261789689952120†L331-L341】. | Reflects how well management controls operating expenses.【261789689952120†L331-L341】
| **Net Profit Margin** | Net profit divided by revenue【261789689952120†L343-L355】. | Shows the portion of revenue that becomes net income after all expenses and taxes.
| **Debt‑to‑Equity (D/E)** | Total liabilities divided by shareholders’ equity【767887888341780†L342-L370】.  Lower values indicate less leverage; high leverage implies risk【767887888341780†L342-L370】. | Assesses financial leverage.
| **Interest Coverage Ratio** | Earnings before interest and taxes (EBIT) or EBITDA divided by interest expense【171311568462930†L429-L432】.  A higher ratio means the company comfortably covers its interest payments. | Measures ability to service debt.
| **Return on Invested Capital (ROIC)** | Net operating profit after tax divided by invested capital. | Evaluates efficiency across both equity and debt.
| **Free Cash Flow Yield** | Free cash flow per share divided by share price. | Shows cash generated relative to valuation.
| **Earnings Variability** | Standard deviation of earnings over several years.  Used in quality scores; higher variability lowers the score【292294796868569†L130-L204】. | Captures earnings stability.

## Sentiment & Risk Metrics

| Metric | Definition & Formula | Relevance |
|-------|----------------------|-----------|
| **Beta (Volatility)** | Beta measures a stock’s volatility relative to the market.  A beta of 1 means the stock moves with the market; less than 1 indicates lower volatility; greater than 1 indicates higher volatility【120308426466401†L377-L396】.  Beta is calculated as the covariance of the stock’s returns with the market divided by the variance of the market’s returns【120308426466401†L412-L427】. | Gauges systematic risk; high beta stocks are more volatile.
| **52‑Week High/Low Distance** | The 52‑week high (or low) is the highest (or lowest) closing price in the past year【339450619862810†L34-L53】.  Investors watch whether a stock is near its annual extremes as a sentiment indicator【339450619862810†L56-L68】.  We compute the percentage distance from the 52‑week high and low. | Measures recent momentum and potential overextension.
| **Short Interest Ratio** | Days‑to‑cover ratio: total shares sold short divided by average daily trading volume【504773760221972†L324-L357】.  A high ratio means more days are needed for short sellers to close their positions【504773760221972†L359-L367】, signalling bearish sentiment. | Captures market pessimism.
| **Institutional Ownership** | Percentage of shares owned by institutional investors.  Institutions (mutual funds, pension funds, etc.) trade in large volumes and influence supply and demand【150511058268090†L417-L423】. | High institutional ownership often signals market confidence.
| **Insider Ownership** | Percentage of shares held by company insiders.  Insider ownership is usually viewed as positive because insiders believe in the company’s prospects【150511058268090†L475-L479】. | Aligns management with shareholders and reflects insider confidence.
| **Analyst Consensus Rating** | Average analyst recommendation (e.g., buy, hold, sell). | Provides aggregated sentiment from professional analysts.
| **Volume & Liquidity** | Average daily volume and relative volume. | High liquidity reduces price manipulation risk.

## Normalization, Winsorization & Z‑Scores

Financial ratios across firms can vary widely and sometimes include extreme outliers.  To ensure that no single metric dominates the composite score, we follow the MSCI Quality Index methodology:

1. **Winsorization:**  For each variable, we rank observations and cap extreme values at the 5th and 95th percentile.  MSCI notes that winsorizing ensures the average values used for standardization are less affected by extreme values【292294796868569†L130-L154】.  An example from Statology shows that a 90% winsorization replaces all values above the 95th percentile with the 95th percentile value and values below the 5th percentile with the 5th percentile value【892638504582282†L34-L62】.  Winsorization reduces the influence of extreme outliers while preserving data structure【892638504582282†L64-L75】.
2. **Z‑Score Standardization:**  After winsorizing, we compute each variable’s z‑score using the mean and standard deviation within the peer universe【292294796868569†L166-L170】.  Statistics literature explains that z‑scores allow comparison of observations between dissimilar variables and place them on a common scale【825486509019026†L38-L44】【825486509019026†L114-L121】.
3. **Percentile Rank Conversion:**  We transform z‑scores into percentile ranks to obtain a 0‑100 scale.  A k‑th percentile is the value below which k% of observations fall【189339291081964†L154-L160】.  Percentile ranks express the relative standing of a score as a percentage of its distribution.
4. **Directionality Adjustment:**  For metrics where lower values are better (e.g., D/E, beta, short interest), we invert the percentile rank (i.e., 100 – percentile).  Similarly, for ratio‑based metrics like PEG or PEGY, values below 1 are considered attractive; we convert PEG to an inverse (1/PEG) before standardization so that higher inverted values correspond to better scores.

## Weighting and Composite Score

We allocate equal weight (25 points each) to the four pillars: **Value**, **Growth**, **Financial Health/Quality**, and **Sentiment & Risk**.  Within each pillar we distribute the weight across metrics as follows (subject to availability):

* **Value (25 points total):**
  * P/E, Forward P/E, P/B — 8 points each.
  * PEG and PEGY — 5 points combined (if a company does not pay dividends, PEGY falls back to PEG).  
  * Dividend yield and cash‑flow yield — 4 points combined.

* **Growth (25 points total):**
  * EPS Growth (TTM & forward) — 12 points.
  * Revenue Growth — 6 points.
  * Analyst EPS & revenue forecasts — 5 points.
  * PEG/PEGY (already counted in value, used here only when growth coverage is sparse) — 2 points.

* **Financial Health/Quality (25 points total):**
  * ROE, ROA, ROIC — 9 points combined.
  * Gross, operating and net margins — 6 points combined.
  * D/E and interest coverage — 6 points.
  * Earnings variability — 2 points (penalize high variability).
  * Free‑cash‑flow yield — 2 points.

* **Sentiment & Risk (25 points total):**
  * Beta (volatility) — 4 points.
  * 52‑week high/low distance — 4 points.
  * Short interest ratio — 4 points.
  * Institutional & insider ownership — 6 points combined.
  * Analyst consensus rating — 3 points.
  * Volume & liquidity — 2 points.

For each company, we calculate the weighted average of the percentile scores for each metric.  The sum of the four pillar scores yields a **Smart Score** between 0 and 100.  We classify scores into bands: **📟 80–100 (Excellent)**, **✅ 60‑79 (Good)**, **⚠️ 40‑59 (Caution)** and **🚫 0‑39 (Risky)**.

## Missing‑Data Fallbacks and Guardrails

* **Absent metrics:**  When a metric is unavailable, we substitute a neutral percentile score of 50.  For example, if analyst estimates are missing, the growth pillar still receives its remaining metrics’ contribution while the missing portion yields 50%.  This avoids unduly penalizing smaller or international firms with limited analyst coverage.
* **Dividend Yield & PEGY:**  For firms that do not pay dividends, we treat the dividend yield as zero in the PEGY formula, effectively reducing PEGY to PEG【572274945212186†L46-L62】.  We also cap extreme PEG or PEGY values by winsorization.
* **Leverage & Beta:**  Negative beta values (indicative of inverse market correlation) are treated separately: we transform beta to a risk metric by taking the absolute value.  A company with near‑zero beta is considered less risky.
* **Outliers:**  Winsorization caps outliers at the 5th and 95th percentile, consistent with MSCI methodology【292294796868569†L130-L154】 and supported by statistical best practices【892638504582282†L34-L62】.  This step ensures that outlier values (e.g., extremely high P/E or negative margins) do not dominate the score.

## Conclusion

This research summarizes the definitions, formulas and rationale behind the Valora Smart Score.  We draw on widely accepted financial ratios and academic/industry methodologies to normalize and combine disparate metrics.  Winsorization and z‑score standardization ensure comparability across metrics, while percentile rank conversion maps scores to an intuitive 0‑100 scale.  Equal weighting across four pillars promotes balanced evaluation.  In subsequent phases we will implement these formulas in code, test them on various tickers, and refine weights based on empirical performance.  For more details about data providers and endpoints, see `docs/datasources.md`.
