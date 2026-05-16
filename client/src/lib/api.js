import { supabase } from './supabase.js';

// All API calls go through this helper so we always attach the auth token.
async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

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
};
