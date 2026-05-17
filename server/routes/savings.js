import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// GET /api/savings — list all goals
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ goals: data || [] });
  } catch (err) {
    console.error('[/savings GET]', err);
    res.status(500).json({ error: 'Failed to fetch savings goals' });
  }
});

// POST /api/savings — create goal
router.post('/', async (req, res) => {
  try {
    const { name, target_amount, emoji, color, deadline } = req.body;
    if (!name || !target_amount) return res.status(400).json({ error: 'name and target_amount required' });
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({ user_id: req.user.id, name, target_amount, emoji: emoji || '🎯', color: color || '#f97316', deadline })
      .select().single();
    if (error) throw error;
    res.json({ goal: data });
  } catch (err) {
    console.error('[/savings POST]', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PATCH /api/savings/:id — update goal (deposit, rename, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['current_amount', 'name', 'target_amount', 'deadline', 'emoji', 'color'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabase
      .from('savings_goals')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ goal: data });
  } catch (err) {
    console.error('[/savings PATCH]', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/savings/:id
router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('savings_goals').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

export default router;
