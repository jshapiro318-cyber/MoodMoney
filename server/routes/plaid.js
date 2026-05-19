import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { generateMockTransactions } from '../lib/mockTransactions.js';

const router = Router();

// Demo mode: no credentials, placeholder credentials, OR sandbox env (sandbox only shows fake "First Platypus Bank" — not useful for real data)
const DEMO_MODE =
  !process.env.PLAID_CLIENT_ID ||
  process.env.PLAID_CLIENT_ID === 'your_plaid_client_id' ||
  (process.env.PLAID_ENV || 'sandbox') !== 'production';

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

// ─── POST /api/plaid/connect  (custom bank-picker flow — bypasses Plaid Link UI)
// Always seeds mock transactions and marks the chosen bank as connected.
// This route exists so the frontend never has to open the Plaid sandbox iframe.
router.post('/connect', async (req, res) => {
  try {
    const bankName = req.body.bankName || 'Connected Bank';
    const mockTxns = generateMockTransactions();
    const upsertData = mockTxns.map(t => ({
      ...t,
      user_id: req.user.id,
      synced_at: new Date().toISOString(),
    }));
    await supabase.from('transactions').upsert(upsertData, { onConflict: 'id' });
    await supabase.from('user_profiles').update({
      bank_connected: true,
      institution_name: bankName,
    }).eq('id', req.user.id);
    res.json({ success: true, institution: bankName });
  } catch (err) {
    console.error('[/plaid/connect]', err);
    res.status(500).json({ error: 'Failed to connect bank account' });
  }
});

// ─── POST /api/plaid/link-token ───────────────────────────────────────────────
// Returns { link_token, demo } — demo:true means no real credentials, use mock flow.
router.post('/link-token', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({ link_token: null, demo: true });
  }

  try {
    const { Products, CountryCode } = await import('plaid');

    const request = {
      user: { client_user_id: req.user.id },
      client_name: 'MoodMoney',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    };

    const response = await plaidClient.linkTokenCreate(request);
    res.json({ link_token: response.data.link_token, demo: false });
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
    // Use the bank name the user chose (passed from the frontend)
    const chosenName = req.body.institution?.name || req.body.institution || 'Demo Bank';
    await supabase.from('user_profiles').update({
      bank_connected: true,
      institution_name: chosenName,
    }).eq('id', req.user.id);
    return res.json({ success: true, institution: chosenName, demo: true });
  }

  try {
    const { Products } = await import('plaid');
    const { public_token, institution } = req.body;
    const exchangeResp = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResp.data;

    // Persist access token
    await supabase.from('plaid_items').upsert({
      user_id: req.user.id,
      item_id,
      access_token,
      institution_name: institution?.name || 'Unknown Bank',
      institution_id: institution?.institution_id,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    const institutionName = institution?.name || 'Your Bank';
    await supabase.from('user_profiles').update({
      bank_connected: true,
      institution_name: institutionName,
    }).eq('id', req.user.id);

    // Immediately fetch 90 days of real transactions and cache them
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const txResp = await plaidClient.transactionsGet({
        access_token,
        start_date: startDate.toISOString().split('T')[0],
        end_date:   new Date().toISOString().split('T')[0],
        options: { count: 500 },
      });
      const transactions = txResp.data.transactions.map(t => ({
        id:          t.transaction_id,
        date:        t.date,
        name:        t.name,
        amount:      t.amount,
        category:    t.personal_finance_category?.primary || t.category?.[0] || 'Other',
        subcategory: t.personal_finance_category?.detailed || t.category?.[1],
        merchant:    t.merchant_name || t.name,
        pending:     t.pending,
        channel:     t.payment_channel,
      }));
      const upsertData = transactions.map(t => ({
        ...t, user_id: req.user.id, synced_at: new Date().toISOString(),
      }));
      if (upsertData.length > 0) {
        await supabase.from('transactions').upsert(upsertData, { onConflict: 'id' });
      }
      // Clear any stale mock transactions by deleting rows with id starting 'mock_'
      await supabase.from('transactions')
        .delete()
        .eq('user_id', req.user.id)
        .like('id', 'mock_%');
    } catch (txErr) {
      console.error('[exchange-token] transaction fetch failed (non-fatal):', txErr?.response?.data || txErr);
    }

    res.json({ success: true, institution: institutionName });
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
