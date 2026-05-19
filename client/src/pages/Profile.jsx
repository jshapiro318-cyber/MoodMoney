import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useProfile, useGamification } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

const BADGE_META = {
  week_warrior:    { label: 'Week Warrior',  icon: 'star',    desc: '7-day no-spend streak',     color: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', text: '#fbbf24' },
  month_master:    { label: 'Month Master',  icon: 'trophy',  desc: '30-day no-spend streak',     color: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.25)', text: '#a855f7' },
  bank_connector:  { label: 'Connected',     icon: 'building-library', desc: 'Linked a bank account', color: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', text: '#34d399' },
  personality_set: { label: 'Self Aware',    icon: 'sparkles', desc: 'Got your personality type',  color: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', text: '#fb923c' },
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

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ value, label, accent }) {
  return (
    <div className="flex-1 text-center py-3"
      style={{ background: '#141420', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xl font-black nums leading-none mb-0.5" style={{ color: accent || '#f0f0f8' }}>{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#606078' }}>{label}</p>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, loading, refresh } = useProfile();
  const { status: gamification } = useGamification();
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState('');
  const [saving, setSaving]   = useState(false);

  async function saveProfile() {
    setSaving(true);
    await api.updateProfile({ display_name: name });
    refresh();
    setSaving(false);
    setEditing(false);
  }

  const xp       = gamification?.xp || 0;
  const level    = getLevelForXP(xp);
  const progress = level.maxXP === 99999 ? 100
    : Math.round(((xp - level.minXP) / (level.maxXP - level.minXP)) * 100);
  const initial  = (profile?.display_name?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="screen-card pb-28">

      {/* ── Header ───────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
        <p className="label mb-1">Account</p>
        <h1 className="text-[28px] font-black tracking-tight leading-none" style={{ letterSpacing: '-0.03em' }}>Profile</h1>
      </motion.div>

      {/* ── Avatar card ──────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card mb-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #a855f7 100%)', boxShadow: '0 4px 16px rgba(249,115,22,0.3)' }}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                className="input flex-1 py-2 text-sm" placeholder="Your name" />
              <button onClick={saveProfile} disabled={saving}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' }}>
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="text-sm font-medium" style={{ color: '#606078' }}>Cancel</button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-black text-lg leading-tight">{displayName}</p>
                <button onClick={() => { setName(profile?.display_name || ''); setEditing(true); }}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.1)', color: '#606078' }}>
                  Edit
                </button>
              </div>
              <p className="text-xs truncate" style={{ color: '#606078' }}>{user?.email}</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Personality pill ─────────────────────────────── */}
      {profile?.personality_type && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass-card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="label mb-1.5">Money Personality</p>
              <p className="font-black text-base leading-tight">{profile.personality_type}</p>
              {profile.personality_data?.tagline && (
                <p className="text-xs mt-1 leading-snug" style={{ color: '#70708a' }}>"{profile.personality_data.tagline}"</p>
              )}
            </div>
            <button onClick={() => navigate('/onboarding')}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', color: '#fb923c' }}>
              Retake
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Level + XP ───────────────────────────────────── */}
      {gamification && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card mb-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="label mb-1">Level {level.level}</p>
              <p className="font-black text-xl leading-tight">{level.name}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-gradient nums">{xp.toLocaleString()}</p>
              <p className="text-xs" style={{ color: '#606078' }}>XP total</p>
            </div>
          </div>

          {/* XP bar */}
          <div className="mb-3">
            <div className="h-1.5 rounded-full mb-1 overflow-hidden" style={{ background: '#1a1a26' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #f97316 0%, #a855f7 100%)' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.9, delay: 0.4, ease: 'easeOut' }} />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] nums" style={{ color: '#50505e' }}>{xp - level.minXP} / {level.maxXP - level.minXP} XP</span>
              <span className="text-[10px] nums" style={{ color: '#50505e' }}>{progress}%</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <StatTile value={gamification.current_streak} label="Day streak" accent="#fb923c" />
            <StatTile value={gamification.longest_streak} label="Best streak" />
            <StatTile value={gamification.badges?.length || 0} label="Badges" accent="#a855f7" />
          </div>
        </motion.div>
      )}

      {/* ── Badges ───────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="glass-card mb-4">
        <p className="label mb-3">Badges</p>
        {gamification?.badges?.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {gamification.badges.map((key, i) => {
              const badge = BADGE_META[key] || { label: key, icon: 'star', desc: '', color: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)', text: '#fb923c' };
              return (
                <motion.div key={key}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.07, type: 'spring', bounce: 0.4 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: badge.color, border: `1px solid ${badge.border}` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <Icon name={badge.icon} size={16} style={{ color: badge.text }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black leading-tight" style={{ color: badge.text }}>{badge.label}</p>
                    <p className="text-[9px] leading-tight mt-0.5" style={{ color: '#70708a' }}>{badge.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Icon name="trophy" size={18} style={{ color: '#50505e' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">No badges yet</p>
              <p className="text-xs mt-0.5" style={{ color: '#606078' }}>Hit a no-spend day to earn your first one</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Premium CTA ──────────────────────────────────── */}
      {!profile?.is_premium && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card mb-4"
          style={{ background: 'linear-gradient(145deg, rgba(249,115,22,0.08) 0%, rgba(168,85,247,0.08) 100%)', border: '1px solid rgba(249,115,22,0.18)' }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="label mb-1">Upgrade</p>
              <p className="font-black text-lg leading-tight">Go Premium</p>
              <p className="text-xs mt-0.5" style={{ color: '#70708a' }}>Unlock everything</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-gradient nums">$9.99</span>
              <p className="text-xs" style={{ color: '#606078' }}>/month</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {['Unlimited AI coaching', 'Advanced emotional analysis', 'Custom financial plans', 'Priority response time'].map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(249,115,22,0.15)' }}>
                  <Icon name="check-circle" size={10} className="text-orange-400" />
                </div>
                <span className="text-sm font-medium" style={{ color: '#c0c0d4' }}>{f}</span>
              </div>
            ))}
          </div>
          <motion.button whileTap={{ scale: 0.97 }} className="btn-primary">
            Upgrade to Premium
          </motion.button>
        </motion.div>
      )}

      {/* ── Sign out ─────────────────────────────────────── */}
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
        whileTap={{ scale: 0.97 }}
        onClick={signOut}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
        style={{ border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', background: 'rgba(248,113,113,0.05)' }}>
        <Icon name="arrow-up" size={14} style={{ transform: 'rotate(90deg)', color: '#f87171' }} />
        Sign out
      </motion.button>

    </div>
  );
}
