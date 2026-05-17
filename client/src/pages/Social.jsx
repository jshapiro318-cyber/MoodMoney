import { useState, useRef } from 'react';
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

export default function Social() {
  const { profile } = useProfile();
  const [recap, setRecap] = useState(null);
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

  const personality = profile?.personality_data;
  const gradient = PERSONALITY_GRADIENTS[profile?.personality_type] || 'from-brand-500 to-accent-purple';

  async function generateRecap() {
    setLoadingRecap(true);
    try {
      const txData = await api.getCachedTransactions(7);
      const data = await api.getWeeklyRecap(txData.transactions || []);
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
      try {
        await navigator.share({ title: 'MoodMoney', text });
      } catch (_) {}
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
      try {
        await navigator.share({ title: 'My Weekly Money Recap', text });
      } catch (_) {}
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-1">Share & Compare</h1>
        <p className="text-surface-500 text-sm mb-5">Show off your money personality</p>
      </motion.div>

      {/* Personality Card */}
      {profile?.personality_type && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <h2 className="font-bold text-sm mb-3">Your Personality Card</h2>

          {/* The shareable card */}
          <div ref={cardRef}
            className={`relative rounded-3xl p-6 bg-gradient-to-br ${gradient} overflow-hidden mb-3`}>
            {/* Background decoration */}
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
        </motion.div>
      )}

      {/* Weekly Recap */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🎵</span>
          <h2 className="font-bold text-sm">Weekly Money Recap</h2>
        </div>

        <AnimatePresence mode="wait">
          {recap ? (
            <motion.div key="recap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Grade badge */}
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
      </motion.div>

      {/* Referral section */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card border border-brand-500/20">
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
      </motion.div>
    </div>
  );
}
