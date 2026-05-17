// Shared Yahoo Finance singleton + rate limiter
// Both stocks.js and trading.js import from here so there is ONE global
// request queue — prevents simultaneous calls that trip Yahoo's rate limit.

import YahooFinance from 'yahoo-finance2';

export const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const YF_DELAY = 120; // ms between requests (slightly more headroom)
let lastYFCall = 0;

export async function yfChart(symbol, days, interval = '1d') {
  const now  = Date.now();
  const wait = Math.max(0, YF_DELAY - (now - lastYFCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastYFCall = Date.now();

  const end   = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return yf.chart(symbol, { period1: start, period2: end, interval }, { validateResult: false });
}

// Lightweight price fetch via chart (works from Railway IPs unlike yf.quote)
export async function fetchPrice(symbol) {
  try {
    const chart  = await yfChart(symbol, 5);
    const meta   = chart?.meta || {};
    const price  = meta.regularMarketPrice;
    if (price) return { price: +price.toFixed(4), meta };
    const closes = (chart?.quotes || []).map(q => q.close).filter(v => v != null);
    if (closes.length) return { price: +closes.at(-1).toFixed(4), meta };
    return null;
  } catch (e) {
    console.warn(`[yf] fetchPrice(${symbol}):`, e.message);
    return null;
  }
}
