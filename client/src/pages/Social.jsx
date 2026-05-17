import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { useProfile } from '../lib/hooks.js';

const PERSONALITY_GRADIENTS = {
  'Emotional Spender':  'from-pink-500 to-orange-400',
  'Chaos Buyer':        'from-yellow-400 to-red-500',
  'Safe Saver':         'from-blue-500 to-cyan-400',
  'Dopamine Shopper':   'from-purple-500 to-pink-400',
  'Future Builder':     'from-green-500 to-teal-400',
  'Status Spender':     'from-amber-400 to-orange-500',
  'Fearful Investor':   'from-slate-500 to-blue-400',
};

const LEVELS = [
  { level: 1, name: 'Money Newbie',    minXP: 0,    maxXP: 200   },
  { level: 2, name: 'Budget Aware',    minXP: 200,  maxXP: 500   },
  { level: 3, name: 'Habit Tracker',   minXP: 500,  maxXP: 1000  },
  { level: 4, name: 'Impulse Fighter', minXP: 1000, maxXP: 2000  },
  { level: 5, name: 'Money Mindful',   minXP: 2000, maxXP: 3500  },
  { level: 6, name: 'Wealth Builder',  minXP: 3500, maxXP: 5500  },
  { level: 7, name: 'Financial Free',  minXP: 5500, maxXP: Infinity },
];

const RANK_EMOJIS = ['🥇','🥈','🥉'];
const BADGE_INFO  = {
  week_warrior:  { emoji: '🔥', label: '7-Day Streak' },
  month_master:  { emoji: '💎', label: '30-Day Streak' },
};

function levelColor(lvl) {
  const colors = ['text-zinc-400','text-blue-400','text-cyan-400','text-emerald-400','text-amber-400','text-orange-400','text-purple-400'];
  return colors[(lvl || 1) - 1] || 'text-zinc-400';
}
function levelBg(lvl) {
  const colors = ['bg-zinc-500/15 border-zinc-500/30','bg-blue-500/15 border-blue-500/30','bg-cyan-500/15 border-cyan-500/30','bg-emerald-500/15 border-emerald-500/30','bg-amber-500/15 border-amber-500/30','bg-orange-500/15 border-orange-500/30','bg-purple-500/15 border-purple-500/30'];
  return colors[(lvl || 1) - 1] || colors[0];
}

// ─── XP progress bar ──────────────────────────────────────────────────────────
function XPBar({ xp, level }) {
  const next = LEVELS.find(l => l.level === (level?.level || 1) + 1);
  const min  = level?.minXP ?? 0;
  const max  = next?.minXP ?? (min + 1000);
  const pct  = Math.min(100, Math.round(((xp - min) / (max - min)) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-[9px] text-surface-500 mb-1">
        <span>{xp.toLocaleString()} XP</span>
        {next && <span>{max.toLocaleString()} XP to Lv {next.level}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-purple"
        />
      </div>
    </div>
  );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────
function LeaderRow({ entry, idx }) {
  const lvl  = entry.level?.level || 1;
  const isMe = entry.isMe;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
        isMe
          ? 'bg-brand-500/10 border-brand-500/30'
          : 'bg-surface-800 border-surface-700'
      }`}
    >
      {/* Rank */}
      <div className="w-7 text-center flex-shrink-0">
        {entry.rank <= 3
          ? <span className="text-lg leading-none">{RANK_EMOJIS[entry.rank - 1]}</span>
          : <span className="text-xs font-black text-surface-500">#{entry.rank}</span>
        }
      </div>

      {/* Avatar circle */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 border ${levelBg(lvl)}`}>
        <span className={levelColor(lvl)}>{entry.name[0]?.toUpperCase() || '?'}</span>
      </div>

      {/* Name + level */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-black truncate ${isMe ? 'text-brand-300' : 'text-white'}`}>
            {entry.name}{isMe ? ' (you)' : ''}
          </p>
          {entry.streak > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold">
              🔥 {entry.streak}
            </span>
          )}
        </div>
        <p className={`text-[10px] font-bold ${levelColor(lvl)}`}>
          Lv {lvl} · {entry.level?.name || 'Money Newbie'}
        </p>
      </div>

      {/* XP */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black tabular-nums text-white">{entry.xp.toLocaleString()}</p>
        <p className="text-[9px] text-surface-500 font-bold">XP</p>
      </div>
    </motion.div>
  );
}

// ─── Leaderboard section ──────────────────────────────────────────────────────
function Leaderboard() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]     = useState('');

  useEffect(() => {
    api.getLeaderboard()
      .then(setData)
      .catch(e => setErr(e?.data?.error || 'Could not load leaderboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-10 gap-2.5">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent" />
      <p className="text-xs text-surface-500">Loading leaderboard…</p>
    </div>
  );

  if (err) return (
    <div className="text-center py-6">
      <p className="text-xs text-surface-500">{err}</p>
    </div>
  );

  if (!data) return null;

  const { leaderboard, myRank, myEntry } = data;
  const myInTop = leaderboard.some(r => r.isMe);

  return (
    <div className="flex flex-col gap-2">
      {/* Top 3 spotlight */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-1.5 mb-1">
          {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, i) => {
            if (!entry) return null;
            const positions = [1, 0, 2]; // display order: 2nd, 1st, 3rd
            const displayPos = positions[i];
            const isCenter   = displayPos === 0;
            const lvl = entry.level?.level || 1;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border ${
                  entry.isMe ? 'bg-brand-500/10 border-brand-500/30' : 'bg-surface-800 border-surface-700'
                } ${isCenter ? 'py-4' : ''}`}
              >
                <span className="text-2xl">{RANK_EMOJIS[entry.rank - 1]}</span>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-black border ${levelBg(lvl)}`}>
                  <span className={levelColor(lvl)}>{entry.name[0]?.toUpperCase() || '?'}</span>
                </div>
                <p className="text-[10px] font-black text-center text-white truncate w-full text-center leading-tight">
                  {entry.isMe ? 'You' : entry.name}
                </p>
                <p className="text-[9px] font-bold text-brand-400 tabular-nums">{entry.xp.toLocaleString()} XP</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Rest of leaderboard */}
      {leaderboard.slice(3).map((entry, idx) => (
        <LeaderRow key={entry.userId} entry={entry} idx={idx} />
      ))}

      {/* My rank if outside top 20 */}
      {!myInTop && myEntry && (
        <>
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-surface-700" />
            <p className="text-[9px] font-bold text-surface-600 uppercase tracking-wider">Your rank</p>
            <div className="flex-1 h-px bg-surface-700" />
          </div>
          <LeaderRow entry={myEntry} idx={0} />
        </>
      )}

      {leaderboard.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🏆</p>
          <p className="text-sm font-semibold text-white">No rankings yet</p>
          <p className="text-xs text-surface-500 mt-1">Be the first to earn XP!</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Social page ─────────────────────────────────────────────────────────
export default function Social() {
  const { profile } = useProfile();
  const [recap, setRecap]         = useState(null);
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [gamification, setGamification] = useState(null);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const cardRef = useRef(null);

  const personality = profile?.personality_data;
  const gradient    = PERSONALITY_GRADIENTS[profile?.personality_type] || 'from-brand-500 to-accent-purple';

  useEffect(() => {
    api.getGamificationStatus().then(setGamification).catch(() => {});
  }, []);

  async function generateRecap() {
    setLoadingRecap(true);
    try {
      const txData = await api.getCachedTransactions(7);
      const data   = await api.getWeeklyRecap(txData.transactions || []);
      setRecap(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRecap(false);
    }
  }

  async function shareCard() {
    const text = `My MoodMoney spending personality: ${profile?.personality_type} ${personality?.emoji}\n"${personality?.tagline}"\n\nTrack your emotional spending at mood-money-jet.vercel.app`;
    if (navigator.share) {
      try { await navigator.share({ title: 'MoodMoney', text }); } catch (_) {}
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function shareRecap() {
    if (!recap) return;
    const text = recap.shareText + '\n\nTrack your money mood at mood-money-jet.vercel.app 💸';
    if (navigator.share) {
      try { await navigator.share({ title: 'My Weekly Money Recap', text }); } catch (_) {}
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const TABS = [
    { id: 'leaderboard', label: '🏆 Leaderboard' },
    { id: 'share',       label: '📤 Share'        },
  ];

  return (
    <div className="screen-card pb-28">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1">Community</p>
        <h1 className="text-[26px] font-black tracking-tight leading-none">Share & Compete</h1>
      </motion.div>

      {/* My XP card */}
      {gamification && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-brand-500/15 to-purple-500/10 border border-brand-500/25 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl border ${levelBg(gamification.level?.level)}`}>
              <span className={levelColor(gamification.level?.level)}>⭐</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-base text-white">{gamification.level?.name || 'Money Newbie'}</p>
              <p className={`text-[10px] font-bold ${levelColor(gamification.level?.level)}`}>
                Level {gamification.level?.level || 1}
                {gamification.current_streak > 0 && ` · 🔥 ${gamification.current_streak}-day streak`}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-black tabular-nums text-white">{(gamification.xp || 0).toLocaleString()}</p>
              <p className="text-[9px] text-surface-500 font-bold">TOTAL XP</p>
            </div>
          </div>
          <XPBar xp={gamification.xp || 0} level={gamification.level} />
          {gamification.badges?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {gamification.badges.map(b => {
                const info = BADGE_INFO[b] || { emoji: '🎖️', label: b };
                return (
                  <span key={b} className="text-[9px] px-2 py-1 rounded-lg bg-surface-700 border border-surface-600 text-surface-300 font-bold">
                    {info.emoji} {info.label}
                  </span>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Tab switcher */}
      <div className="flex rounded-xl overflow-hidden border border-surface-700 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-black transition-all ${
              activeTab === t.id
                ? 'bg-brand-500/15 text-brand-400 border-brand-500/0'
                : 'bg-surface-800 text-surface-500 hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Leaderboard tab ── */}
        {activeTab === 'leaderboard' && (
          <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500">Top earners · all time</p>
              <p className="text-[9px] text-surface-600">earn XP by completing app actions</p>
            </div>
            <Leaderboard />
          </motion.div>
        )}

        {/* ── Share tab ── */}
        {activeTab === 'share' && (
          <motion.div key="share" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4">

            {/* Personality Card */}
            {profile?.personality_type && (
              <div>
                <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-3">Your Personality Card</p>
                <div ref={cardRef}
                  className={`relative rounded-3xl p-6 bg-gradient-to-br ${gradient} overflow-hidden mb-3`}>
                  <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-black/10 translate-y-1/2 -translate-x-1/2" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-white/70 text-xs font-medium mb-1">MoodMoney</p>
                        <p className="text-white text-xs opacity-60">mood-money-jet.vercel.app</p>
                      </div>
                      <span className="text-4xl">{personality?.emoji}</span>
                    </div>
                    <p className="text-white/80 text-xs mb-1">I'm a</p>
                    <h2 className="text-white text-2xl font-black mb-2">{profile.personality_type}</h2>
                    <p className="text-white/90 text-sm italic mb-4">"{personality?.tagline}"</p>
                    <div className="flex gap-3">
                      <div className="flex-1 bg-black/20 rounded-xl p-2.5 text-center">
                        <p className="text-white/60 text-[10px]">Superpower</p>
                        <p className="text-white text-xs font-semibold mt-0.5 line-clamp-2">{personality?.superpower}</p>
                      </div>
                      <div className="flex-1 bg-black/20 rounded-xl p-2.5 text-center">
                        <p className="text-white/60 text-[10px]">Watch out for</p>
                        <p className="text-white text-xs font-semibold mt-0.5 line-clamp-2">{personality?.blindspot}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={shareCard}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  <span>📤</span>
                  {copied ? 'Copied to clipboard!' : 'Share my money personality'}
                </motion.button>
              </div>
            )}

            {/* Weekly Recap */}
            <div className="glass-card">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🎵</span>
                <h2 className="font-bold text-sm">Weekly Money Recap</h2>
              </div>
              <AnimatePresence mode="wait">
                {recap ? (
                  <motion.div key="recap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black
                        ${recap.grade === 'A' ? 'bg-green-500/20 text-green-400' :
                          recap.grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                          recap.grade === 'C' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'}`}>
                        {recap.grade}
                      </div>
                      <div>
                        <p className="font-bold">${recap.totalSpent?.toFixed(0)} spent</p>
                        <p className="text-xs text-surface-500">Score: {recap.score}/100</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-surface-700/50 rounded-xl p-3">
                        <p className="text-[10px] text-surface-500 mb-0.5">Top category</p>
                        <p className="text-sm font-semibold">{recap.topCategory}</p>
                      </div>
                      <div className="bg-surface-700/50 rounded-xl p-3">
                        <p className="text-[10px] text-surface-500 mb-0.5">Top merchant</p>
                        <p className="text-sm font-semibold truncate">{recap.topMerchant}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 mb-4">
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 text-sm">✓</span>
                        <p className="text-sm text-surface-300">{recap.winOfTheWeek}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-400 text-sm">↗</span>
                        <p className="text-sm text-surface-300">{recap.challengeOfTheWeek}</p>
                      </div>
                    </div>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={shareRecap}
                      className="btn-ghost w-full text-sm">
                      📤 Share this recap
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div key="generate" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="text-surface-500 text-sm mb-3">
                      Get a Spotify Wrapped-style breakdown of your week
                    </p>
                    <button onClick={generateRecap} disabled={loadingRecap}
                      className="btn-primary w-full text-sm">
                      {loadingRecap ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating your recap...
                        </span>
                      ) : 'Generate this week\'s recap →'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Referral */}
            <div className="glass-card border border-brand-500/20">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🔗</span>
                <div>
                  <p className="font-semibold text-sm">Invite a friend</p>
                  <p className="text-xs text-surface-500">Share MoodMoney with someone who needs it</p>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  const text = 'Check out MoodMoney — an AI app that helps you understand WHY you spend 💸\nmood-money-jet.vercel.app';
                  if (navigator.share) {
                    try { await navigator.share({ title: 'MoodMoney', text }); } catch (_) {}
                  } else {
                    await navigator.clipboard.writeText('mood-money-jet.vercel.app');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="btn-ghost w-full text-sm">
                {copied ? '✓ Copied!' : '📤 Share the app'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
