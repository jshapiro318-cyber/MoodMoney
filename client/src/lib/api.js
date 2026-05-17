import { supabase } from './supabase.js';

// Railway backend URL — used for slow AI calls to bypass Vercel's 30s proxy timeout
const RAILWAY = 'https://moodmoney-production-f318.up.railway.app';

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

// Standard API fetch — goes through Vercel proxy (good for fast endpoints)
async function apiFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || 'Request failed'), { status: res.status, data: json });
  return json;
}

// Direct Railway fetch — bypasses Vercel proxy for slow AI calls (no 30s timeout)
async function railFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${RAILWAY}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || 'Request failed'), { status: res.status, data: json });
  return json;
}

export const api = {
  // ─── Users ──────────────────────────────────────────────────────────────────
  getProfile: () => apiFetch('/users/profile'),
  updateProfile: (data) => apiFetch('/users/profile', { method: 'PATCH', body: data }),

  // ─── Plaid ───────────────────────────────────────────────────────────────────
  getLinkToken: () => apiFetch('/plaid/link-token', { method: 'POST' }),
  exchangeToken: (public_token, institution) =>
    apiFetch('/plaid/exchange-token', { method: 'POST', body: { public_token, institution } }),
  getTransactions: (days = 60) => apiFetch(`/plaid/transactions?days=${days}`),
  getAccounts: () => apiFetch('/plaid/accounts'),

  // ─── Transactions ────────────────────────────────────────────────────────────
  getCachedTransactions: (days = 60) => apiFetch(`/transactions?days=${days}`),
  getTransactionSummary: () => apiFetch('/transactions/summary'),

  // ─── AI ──────────────────────────────────────────────────────────────────────
  analyzePersonality: (answers, transactions) =>
    apiFetch('/ai/personality', { method: 'POST', body: { answers, transactions } }),
  analyzeSpending: (transactions) =>
    apiFetch('/ai/analyze-spending', { method: 'POST', body: { transactions } }),
  affordThis: (description, price, imageUrl) =>
    apiFetch('/ai/afford-this', { method: 'POST', body: { description, price, imageUrl } }),
  simulate: (scenario) =>
    apiFetch('/ai/simulate', { method: 'POST', body: { scenario } }),
  chat: (messages) =>
    apiFetch('/ai/chat', { method: 'POST', body: { messages } }),
  getProactiveAlerts: (transactions) =>
    apiFetch('/ai/proactive-alerts', { method: 'POST', body: { transactions } }),

  // ─── Gamification ────────────────────────────────────────────────────────────
  getGamificationStatus: () => apiFetch('/gamification/status'),
  awardXP: (action) => apiFetch('/gamification/award-xp', { method: 'POST', body: { action } }),
  logNoSpendDay: () => apiFetch('/gamification/log-no-spend', { method: 'POST' }),

  // ─── Savings Goals ───────────────────────────────────────────────────────────
  getGoals: () => apiFetch('/savings'),
  createGoal: (goal) => apiFetch('/savings', { method: 'POST', body: goal }),
  updateGoal: (id, updates) => apiFetch(`/savings/${id}`, { method: 'PATCH', body: updates }),
  deleteGoal: (id) => apiFetch(`/savings/${id}`, { method: 'DELETE' }),

  // ─── AI extras ───────────────────────────────────────────────────────────────
  getSavingsRecommendation: (transactions, goals) =>
    apiFetch('/ai/savings-recommendation', { method: 'POST', body: { transactions, goals } }),
  getWeeklyRecap: (transactions) =>
    apiFetch('/ai/weekly-recap', { method: 'POST', body: { transactions } }),

  // ─── Stocks ──────────────────────────────────────────────────────────────────
  getMarket: () => apiFetch('/stocks/market'),
  searchStock: (symbol) => apiFetch(`/stocks/search/${symbol}`),
  // These three use railFetch (direct to Railway) to avoid Vercel's 30s proxy timeout
  getDailyPicks: (marketStocks) => railFetch('/stocks/daily', { method: 'POST', body: { marketStocks: marketStocks || [] } }),
  analyzeStock: (symbol) => railFetch('/stocks/analyze-stock', { method: 'POST', body: { symbol } }),
  getStockNews: () => railFetch('/stocks/news'),
  getStockDetail: (symbol, range = '1M') => apiFetch(`/stocks/detail/${symbol}?range=${range}`),
  getWatchlist: () => apiFetch('/stocks/watchlist'),
  addToWatchlist: (symbol) => apiFetch('/stocks/watchlist', { method: 'POST', body: { symbol } }),
  removeFromWatchlist: (symbol) => apiFetch(`/stocks/watchlist/${symbol}`, { method: 'DELETE' }),

  // ─── Learn ───────────────────────────────────────────────────────────────────
  getLearnProgress: () => apiFetch('/learn/progress'),
  completeLesson: (lessonId, score, xpEarned) =>
    apiFetch('/learn/complete', { method: 'POST', body: { lessonId, score, xpEarned } }),
};
