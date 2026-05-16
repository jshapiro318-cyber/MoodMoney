import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// ─── GET /api/transactions ────────────────────────────────────────────────────
// Returns cached transactions from Supabase (synced from Plaid).
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 60;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;
    res.json({ transactions: data });
  } catch (err) {
    console.error('[GET /transactions]', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ─── GET /api/transactions/summary ───────────────────────────────────────────
// Returns aggregated spending stats by category and time period.
router.get('/summary', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, category, date')
      .eq('user_id', req.user.id)
      .gte('date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gt('amount', 0); // Only debits (spending)

    if (error) throw error;

    // Group by category
    const byCategory = data.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {});

    // Group by day of week
    const byDayOfWeek = data.reduce((acc, t) => {
      const dow = new Date(t.date).toLocaleDateString('en-US', { weekday: 'long' });
      acc[dow] = (acc[dow] || 0) + t.amount;
      return acc;
    }, {});

    // Group by hour of day (not available from Plaid without premium, so we skip)
    const totalSpend = data.reduce((sum, t) => sum + t.amount, 0);

    res.json({
      totalSpend: Math.round(totalSpend * 100) / 100,
      byCategory,
      byDayOfWeek,
      transactionCount: data.length,
      avgTransaction: Math.round((totalSpend / data.length) * 100) / 100,
    });
  } catch (err) {
    console.error('[GET /transactions/summary]', err);
    res.status(500).json({ error: 'Failed to summarize transactions' });
  }
});

export default router;
