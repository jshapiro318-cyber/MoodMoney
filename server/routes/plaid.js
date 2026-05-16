import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { generateMockTransactions } from '../lib/mockTransactions.js';

const router = Router();

// Check if Plaid credentials are configured — if not, run in demo mode
const DEMO_MODE = !process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === 'your_plaid_client_id';

// Only import and init Plaid when real credentials exist
let plaidClient = null;
if (!DEMO_MODE) {
  const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
  const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  plaidClient = new PlaidApi(plaidConfig);
}

if (DEMO_MODE) {
  console.log('💡 Plaid not configured — running in demo mode with mock transactions');
}

router.use(requireAuth);

// ─── POST /api/plaid/link-token ───────────────────────────────────────────────
router.post('/link-token', async (req, res) => {
  if (DEMO_MODE) {
    // Return a fake token — the frontend will detect demo mode and skip Plaid Link
    return res.json({ link_token: 'demo_link_token', demo: true });
  }

  try {
    const { Products, CountryCode } = await import('plaid');
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.user.id },
      client_name: 'MoodMoney',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('[/plaid/link-token]', err?.response?.data || err);
    res.status(500).json({ error: 'Failed to create Plaid link token' });
  }
});

// ─── POST /api/plaid/exchange-token ──────────────────────────────────────────
router.post('/exchange-token', async (req, res) => {
  if (DEMO_MODE) {
    // Mark bank as connected and seed mock transactions into Supabase
    const mockTxns = generateMockTransactions();
    const upsertData = mockTxns.map(t => ({ ...t, user_id: req.user.id, synced_at: new Date().toISOString() }));
    await supabase.from('transactions').upsert(upsertData, { onConflict: 'id' });
    await supabase.from('user_profiles').update({ bank_connected: true }).eq('id', req.user.id);
    return res.json({ success: true, institution: 'Demo Bank', demo: true });
  }

  try {
    const { public_token, institution } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    await supabase.from('plaid_items').upsert({
      user_id: req.user.id,
      item_id,
      access_token,
      institution_name: institution?.name || 'Unknown Bank',
      institution_id: institution?.institution_id,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await supabase.from('user_profiles').update({ bank_connected: true }).eq('id', req.user.id);
    res.json({ success: true, institution: institution?.name });
  } catch (err) {
    console.error('[/plaid/exchange-token]', err?.response?.data || err);
    res.status(500).json({ error: 'Failed to connect bank account' });
  }
});

// ─── GET /api/plaid/transactions ──────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  if (DEMO_MODE) {
    const transactions = generateMockTransactions();
    // Sync to Supabase so the rest of the app can read from there
    const upsertData = transactions.map(t => ({ ...t, user_id: req.user.id, synced_at: new Date().toISOString() }));
    await supabase.from('transactions').upsert(upsertData, { onConflict: 'id' });
    return res.json({ transactions, total: transactions.length, demo: true });
  }

  try {
    const days = parseInt(req.query.days) || 60;
    const { data: plaidItem } = await supabase
      .from('plaid_items').select('access_token').eq('user_id', req.user.id).single();

    if (!plaidItem) return res.status(404).json({ error: 'No bank account connected' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const response = await plaidClient.transactionsGet({
      access_token: plaidItem.access_token,
      start_date: startDate.toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      options: { count: 500 },
    });

    const transactions = response.data.transactions.map(t => ({
      id: t.transaction_id,
      date: t.date,
      name: t.name,
      amount: t.amount,
      category: t.personal_finance_category?.primary || t.category?.[0] || 'Other',
      subcategory: t.personal_finance_category?.detailed || t.category?.[1],
      merchant: t.merchant_name || t.name,
      pending: t.pending,
      channel: t.payment_channel,
    }));

    const upsertData = transactions.map(t => ({ ...t, user_id: req.user.id, synced_at: new Date().toISOString() }));
    if (upsertData.length > 0) {
      await supabase.from('transactions').upsert(upsertData, { onConflict: 'id' });
    }

    res.json({ transactions, total: transactions.length, accounts: response.data.accounts });
  } catch (err) {
    console.error('[/plaid/transactions]', err?.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ─── GET /api/plaid/accounts ──────────────────────────────────────────────────
router.get('/accounts', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      accounts: [{ account_id: 'demo_checking', name: 'Demo Checking', type: 'depository', balances: { current: 2847.50 } }],
      demo: true,
    });
  }

  try {
    const { data: plaidItem } = await supabase
      .from('plaid_items').select('access_token').eq('user_id', req.user.id).single();
    if (!plaidItem) return res.status(404).json({ error: 'No bank account connected' });
    const response = await plaidClient.accountsGet({ access_token: plaidItem.access_token });
    res.json({ accounts: response.data.accounts });
  } catch (err) {
    console.error('[/plaid/accounts]', err?.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

export default router;
