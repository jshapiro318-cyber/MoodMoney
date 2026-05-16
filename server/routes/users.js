import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// ─── GET /api/users/profile ───────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    // Upsert on read — creates the profile if it doesn't exist yet
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id: req.user.id, email: req.user.email }, { onConflict: 'id', ignoreDuplicates: false })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[GET /users/profile]', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── PATCH /api/users/profile ─────────────────────────────────────────────────
router.patch('/profile', async (req, res) => {
  try {
    const allowedFields = [
      'display_name', 'monthly_income', 'savings_goal', 'savings_target_amount',
      'onboarding_completed', 'personality_answers', 'bank_connected',
    ];

    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    // Upsert so it works even if the profile row doesn't exist yet
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id: req.user.id, email: req.user.email, ...updates }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[PATCH /users/profile]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
