import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// XP values for each action type
const XP_VALUES = {
  no_spend_day: 50,
  under_budget_week: 100,
  connected_bank: 25,
  completed_onboarding: 75,
  chat_session: 10,
  simulation_run: 15,
  afford_check: 10,
  seven_day_streak: 150,
  thirty_day_streak: 500,
};

const LEVELS = [
  { level: 1, name: 'Money Newbie', minXP: 0, maxXP: 200 },
  { level: 2, name: 'Budget Aware', minXP: 200, maxXP: 500 },
  { level: 3, name: 'Habit Tracker', minXP: 500, maxXP: 1000 },
  { level: 4, name: 'Impulse Fighter', minXP: 1000, maxXP: 2000 },
  { level: 5, name: 'Money Mindful', minXP: 2000, maxXP: 3500 },
  { level: 6, name: 'Wealth Builder', minXP: 3500, maxXP: 5500 },
  { level: 7, name: 'Financial Free', minXP: 5500, maxXP: Infinity },
];

function getLevelForXP(xp) {
  return LEVELS.find(l => xp >= l.minXP && xp < l.maxXP) || LEVELS[LEVELS.length - 1];
}

// ─── GET /api/gamification/status ─────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gamification')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Initialize gamification record for new users
      const initial = {
        user_id: req.user.id,
        xp: 0,
        current_streak: 0,
        longest_streak: 0,
        badges: [],
        weekly_challenges_completed: [],
        last_no_spend_date: null,
      };
      const { data: newRecord } = await supabase.from('gamification').insert(initial).select().single();
      return res.json({ ...newRecord, level: getLevelForXP(0) });
    }

    if (error) throw error;
    res.json({ ...data, level: getLevelForXP(data.xp) });
  } catch (err) {
    console.error('[GET /gamification/status]', err);
    res.status(500).json({ error: 'Failed to fetch gamification status' });
  }
});

// ─── POST /api/gamification/award-xp ──────────────────────────────────────────
router.post('/award-xp', async (req, res) => {
  try {
    const { action } = req.body;
    const xpGain = XP_VALUES[action] || 5;

    const { data: current } = await supabase
      .from('gamification')
      .select('xp, badges')
      .eq('user_id', req.user.id)
      .single();

    const newXP = (current?.xp || 0) + xpGain;
    const oldLevel = getLevelForXP(current?.xp || 0);
    const newLevel = getLevelForXP(newXP);
    const leveledUp = newLevel.level > oldLevel.level;

    await supabase
      .from('gamification')
      .upsert({ user_id: req.user.id, xp: newXP }, { onConflict: 'user_id' });

    res.json({ xpGain, totalXP: newXP, leveledUp, newLevel: leveledUp ? newLevel : null });
  } catch (err) {
    console.error('[POST /gamification/award-xp]', err);
    res.status(500).json({ error: 'Failed to award XP' });
  }
});

// ─── POST /api/gamification/log-no-spend ──────────────────────────────────────
// Called when the app detects a day with zero spending.
router.post('/log-no-spend', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: current } = await supabase
      .from('gamification')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (current?.last_no_spend_date === today) {
      return res.json({ alreadyLogged: true });
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = current?.last_no_spend_date === yesterday.toISOString().split('T')[0];

    const newStreak = wasYesterday ? (current.current_streak + 1) : 1;
    const longestStreak = Math.max(newStreak, current?.longest_streak || 0);
    const newXP = (current?.xp || 0) + XP_VALUES.no_spend_day;

    // Award streak bonuses
    const badges = [...(current?.badges || [])];
    if (newStreak === 7 && !badges.includes('week_warrior')) badges.push('week_warrior');
    if (newStreak === 30 && !badges.includes('month_master')) badges.push('month_master');

    await supabase.from('gamification').upsert({
      user_id: req.user.id,
      xp: newXP,
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_no_spend_date: today,
      badges,
    }, { onConflict: 'user_id' });

    res.json({
      streak: newStreak,
      longestStreak,
      xpGain: XP_VALUES.no_spend_day,
      newBadge: badges.length > (current?.badges?.length || 0) ? badges[badges.length - 1] : null,
    });
  } catch (err) {
    console.error('[POST /gamification/log-no-spend]', err);
    res.status(500).json({ error: 'Failed to log no-spend day' });
  }
});

// ─── GET /api/gamification/leaderboard ────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    // Top 50 by XP
    const { data: topRows, error } = await supabase
      .from('gamification')
      .select('user_id, xp, current_streak, longest_streak, badges')
      .order('xp', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Fetch display names / emails for those users
    const userIds = (topRows || []).map(r => r.user_id);
    let profileMap = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, personality_type')
        .in('id', userIds);
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }

    function makeName(uid) {
      const p = profileMap[uid] || {};
      if (p.display_name) return p.display_name;
      if (p.email) return p.email.split('@')[0];
      return 'Anonymous';
    }

    // Build ranked list
    const leaderboard = (topRows || []).map((row, idx) => ({
      rank:     idx + 1,
      userId:   row.user_id,
      name:     makeName(row.user_id),
      xp:       row.xp || 0,
      level:    getLevelForXP(row.xp || 0),
      streak:   row.current_streak || 0,
      badges:   row.badges || [],
      isMe:     row.user_id === req.user.id,
    }));

    // Find current user's rank + data (even if outside top 50)
    let myRank  = leaderboard.find(r => r.isMe)?.rank ?? null;
    let myEntry = leaderboard.find(r => r.isMe) ?? null;

    if (!myEntry) {
      const { data: myRow } = await supabase
        .from('gamification')
        .select('xp, current_streak, badges')
        .eq('user_id', req.user.id)
        .single();

      if (myRow) {
        const { count } = await supabase
          .from('gamification')
          .select('*', { count: 'exact', head: true })
          .gt('xp', myRow.xp || 0);

        myRank  = (count || 0) + 1;
        myEntry = {
          rank:   myRank,
          userId: req.user.id,
          name:   makeName(req.user.id),
          xp:     myRow.xp || 0,
          level:  getLevelForXP(myRow.xp || 0),
          streak: myRow.current_streak || 0,
          badges: myRow.badges || [],
          isMe:   true,
        };
      }
    }

    res.json({ leaderboard: leaderboard.slice(0, 20), myRank, myEntry });
  } catch (err) {
    console.error('[GET /gamification/leaderboard]', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
