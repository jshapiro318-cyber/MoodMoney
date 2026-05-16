import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfile, useGamification } from '../lib/hooks.js';
import { api } from '../lib/api.js';

const BADGE_META = {
  week_warrior:    { label: 'Week Warrior',  icon: '🔥', desc: '7-day no-spend streak' },
  month_master:    { label: 'Month Master',  icon: '👑', desc: '30-day no-spend streak' },
  bank_connector:  { label: 'Connected',     icon: '🏦', desc: 'Linked a bank account' },
  personality_set: { label: 'Self Aware',    icon: '🧠', desc: 'Got your personality type' },
};

const LEVELS = [
  { level: 1, name: 'Money Newbie',    minXP: 0,    maxXP: 200  },
  { level: 2, name: 'Budget Aware',    minXP: 200,  maxXP: 500  },
  { level: 3, name: 'Habit Tracker',   minXP: 500,  maxXP: 1000 },
  { level: 4, name: 'Impulse Fighter', minXP: 1000, maxXP: 2000 },
  { level: 5, name: 'Money Mindful',   minXP: 2000, maxXP: 3500 },
  { level: 6, name: 'Wealth Builder',  minXP: 3500, maxXP: 5500 },
  { level: 7, name: 'Financial Free',  minXP: 5500, maxXP: 99999 },
];

function getLevelForXP(xp) {
  return LEVELS.find(l => xp >= l.minXP && xp < l.maxXP) || LEVELS[LEVELS.length - 1];
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, loading, refresh } = useProfile();
  const { status: gamification } = useGamification();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    setSaving(true);
    await api.updateProfile({ display_name: name });
    refresh();
    setSaving(false);
    setEditing(false);
  }

  const xp = gamification?.xp || 0;
  const level = getLevelForXP(xp);
  const progress = level.maxXP === 99999 ? 100
    : Math.round(((xp - level.minXP) / (level.maxXP - level.minXP)) * 100);

  return (
    <div className="screen-card pb-24">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {/* Avatar + name */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-3xl font-black">
          {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                className="flex-1 bg-surface-800 border border-brand-500 rounded-xl px-3 py-2 text-white text-sm outline-none" />
              <button onClick={saveProfile} disabled={saving}
                className="text-brand-400 text-sm font-medium">{saving ? '...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} className="text-surface-500 text-sm">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg">{profile?.display_name || 'No name set'}</p>
              <button onClick={() => { setName(profile?.display_name || ''); setEditing(true); }}
                className="text-xs text-surface-500 border border-surface-600 rounded-lg px-2 py-0.5">
                Edit
              </button>
            </div>
          )}
          <p className="text-surface-500 text-sm">{user?.email}</p>
        </div>
      </motion.div>

      {/* Personality */}
      {profile?.personality_type && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass-card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-surface-500 mb-1">Money Personality</p>
              <p className="font-bold text-base">
                {profile.personality_data?.emoji} {profile.personality_type}
              </p>
              <p className="text-surface-500 text-xs mt-0.5 italic">"{profile.personality_data?.tagline}"</p>
            </div>
            <button onClick={() => navigate('/onboarding')}
              className="text-xs text-brand-400 border border-brand-500/30 rounded-lg px-2 py-1">
              Retake
            </button>
          </div>
        </motion.div>
      )}

      {/* Level + XP */}
      {gamification && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-surface-500">Level {level.level}</p>
              <p className="font-bold text-lg">{level.name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-gradient">{xp.toLocaleString()}</p>
              <p className="text-xs text-surface-500">XP total</p>
            </div>
          </div>

          {/* XP progress bar */}
          <div className="w-full bg-surface-600 rounded-full h-2 mb-2">
            <motion.div
              className="bg-gradient-to-r from-brand-500 to-accent-purple h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          </div>
          <div className="flex justify-between text-xs text-surface-500">
            <span>{xp - level.minXP} / {level.maxXP - level.minXP} XP to level {level.level + 1}</span>
            <span>{progress}%</span>
          </div>

          {/* Streak row */}
          <div className="flex gap-3 mt-3 pt-3 border-t border-surface-600">
            <div className="flex-1 text-center">
              <p className="text-xl font-black text-brand-400">🔥 {gamification.current_streak}</p>
              <p className="text-xs text-surface-500">Day streak</p>
            </div>
            <div className="w-px bg-surface-600" />
            <div className="flex-1 text-center">
              <p className="text-xl font-black">{gamification.longest_streak}</p>
              <p className="text-xs text-surface-500">Best streak</p>
            </div>
            <div className="w-px bg-surface-600" />
            <div className="flex-1 text-center">
              <p className="text-xl font-black">{gamification.badges?.length || 0}</p>
              <p className="text-xs text-surface-500">Badges</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Badges */}
      {gamification?.badges?.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-card mb-4">
          <p className="text-xs text-surface-500 mb-3">Badges earned</p>
          <div className="grid grid-cols-3 gap-3">
            {gamification.badges.map((key, i) => {
              const badge = BADGE_META[key] || { label: key, icon: '🏅', desc: '' };
              return (
                <motion.div key={key}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.08, type: 'spring', bounce: 0.5 }}
                  className="flex flex-col items-center gap-1.5 bg-surface-700 rounded-xl p-3 text-center"
                >
                  <span className="text-2xl">{badge.icon}</span>
                  <span className="text-xs font-medium leading-tight">{badge.label}</span>
                  <span className="text-[10px] text-surface-500 leading-tight">{badge.desc}</span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="glass-card mb-4 text-center py-6">
          <p className="text-2xl mb-2">🏅</p>
          <p className="text-sm text-surface-500">No badges yet</p>
          <p className="text-xs text-surface-500 mt-1">Hit a no-spend day to earn your first one</p>
        </motion.div>
      )}

      {/* Premium CTA */}
      {!profile?.is_premium && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card mb-4 border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-accent-purple/10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-bold text-base">✨ Go Premium</p>
              <p className="text-surface-500 text-xs mt-0.5">Unlock everything</p>
            </div>
            <span className="text-2xl font-black text-brand-400">$9.99<span className="text-xs font-normal text-surface-500">/mo</span></span>
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            {['Unlimited AI coaching', 'Advanced emotional analysis', 'Custom financial plans', 'Priority response time'].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <span className="text-brand-400 text-xs">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
          <motion.button whileTap={{ scale: 0.97 }}
            className="btn-primary py-3 text-sm">
            Upgrade to Premium
          </motion.button>
        </motion.div>
      )}

      {/* Sign out */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
        whileTap={{ scale: 0.97 }}
        onClick={signOut}
        className="w-full py-4 rounded-2xl border border-red-500/30 text-red-400 font-medium text-base"
      >
        Sign out
      </motion.button>
    </div>
  );
}
