import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// GET /api/learn/progress
router.get('/progress', async (req, res) => {
  try {
    const { data } = await supabase
      .from('learn_progress')
      .select('*')
      .eq('user_id', req.user.id);
    res.json({ progress: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// POST /api/learn/complete
router.post('/complete', async (req, res) => {
  try {
    const { lessonId, score, xpEarned } = req.body;
    await supabase.from('learn_progress').upsert({
      user_id: req.user.id,
      lesson_id: lessonId,
      score,
      xp_earned: xpEarned,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lesson_id' });

    // Award XP
    const { data: gam } = await supabase.from('gamification').select('xp').eq('user_id', req.user.id).single();
    if (gam) {
      await supabase.from('gamification').update({ xp: (gam.xp || 0) + xpEarned }).eq('user_id', req.user.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

export default router;
