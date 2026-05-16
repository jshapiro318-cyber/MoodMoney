import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { useProfile } from '../lib/hooks.js';
import InsightCard from '../components/InsightCard.jsx';
import AlertBanner from '../components/AlertBanner.jsx';
import XPBar from '../components/XPBar.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const [insights, setInsights] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [emotionalScore, setEmotionalScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!profileLoading && profile) {
      if (!profile.onboarding_completed) {
        navigate('/onboarding');
        return;
      }
      loadData();
    }
  }, [profile, profileLoading]);

  async function loadData(forceRefresh = false) {
    try {
      // Load transactions (fast — from Supabase cache)
      const txData = await api.getCachedTransactions(60);
      const txns = txData.transactions || [];

      if (!forceRefresh) {
        // Try to use cached Supabase analysis first for instant load
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const sb = (await import('../lib/supabase.js')).supabase;
          const { data: cached } = await sb
            .from('spending_analyses')
            .select('analysis, analyzed_at')
            .single();

          if (cached?.analysis) {
            setInsights(cached.analysis.insights || []);
            setEmotionalScore(cached.analysis.emotionalScore);
            setLastUpdated(new Date(cached.analyzed_at));
            setLoading(false);

            // Refresh in background only if cache is older than 1 hour
            const age = Date.now() - new Date(cached.analyzed_at).getTime();
            if (age > 60 * 60 * 1000) {
              runAIAnalysis(txns, true);
            }
            // Load alerts in background regardless
            loadAlerts(txns);
            return;
          }
        } catch (_) {}
      }

      // No cache — run fresh analysis
      setLoading(true);
      await runAIAnalysis(txns, false);
      loadAlerts(txns);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setLoading(false);
    }
  }

  async function runAIAnalysis(txns, background = false) {
    if (background) setRefreshing(true);
    try {
      const analysis = await api.analyzeSpending(txns);
      setInsights(analysis.insights || []);
      setEmotionalScore(analysis.emotionalScore);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('AI analysis error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadAlerts(txns) {
    try {
      const data = await api.getProactiveAlerts(txns.slice(0, 50));
      setAlerts(data.alerts || []);
    } catch (_) {}
  }

  async function handleRefresh() {
    const txData = await api.getCachedTransactions(60);
    await loadData(true);
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Hey';
    return 'Good evening';
  };

  return (
    <div className="screen-card pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-surface-500 text-sm">{greeting()}</p>
          <h1 className="text-2xl font-bold">
            {profile?.display_name?.split(' ')[0] || 'There'} 👋
          </h1>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-base font-bold"
        >
          {profile?.display_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || '?'}
        </button>
      </div>

      {/* XP bar */}
      <XPBar />

      {/* Personality pill */}
      {profile?.personality_type && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-4"
        >
          <span className="pill bg-brand-500/15 text-brand-400 text-xs">
            {profile.personality_data?.emoji} {profile.personality_type}
          </span>
          {refreshing && (
            <span className="text-xs text-surface-500 flex items-center gap-1">
              <span className="w-2.5 h-2.5 border border-surface-500 border-t-transparent rounded-full animate-spin" />
              Refreshing insights...
            </span>
          )}
        </motion.div>
      )}

      {/* Emotional score */}
      {emotionalScore !== null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card mb-4 flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-surface-500 mb-1">Emotional Spending Score</p>
            <p className="text-2xl font-black text-gradient">
              {emotionalScore}<span className="text-base font-normal text-surface-500">/100</span>
            </p>
            <p className="text-xs text-surface-500 mt-1">
              {emotionalScore > 70 ? 'High — emotions drive most of your buys' :
               emotionalScore > 40 ? 'Medium — mixed triggers' :
               'Low — you spend pretty intentionally'}
            </p>
          </div>
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-full h-full">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#26262c" strokeWidth="3" />
              <motion.circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#f97316" strokeWidth="3"
                strokeLinecap="round"
                initial={{ strokeDasharray: '0 100' }}
                animate={{ strokeDasharray: `${emotionalScore} 100` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{emotionalScore}</span>
          </div>
        </motion.div>
      )}

      {/* Alerts */}
      <AnimatePresence>
        {alerts.map(alert => <AlertBanner key={alert.id} alert={alert} />)}
      </AnimatePresence>

      {/* Insights header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-base">Your Insights</h2>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-surface-500">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={handleRefresh} disabled={refreshing || loading}
            className="text-xs text-brand-400 disabled:opacity-40">
            Refresh
          </button>
        </div>
      </div>

      {/* Insight cards */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <motion.div key={i} animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="glass-card h-24 bg-surface-700" />
          ))}
          <p className="text-center text-surface-500 text-xs mt-2">
            Claude is reading your transactions...
          </p>
        </div>
      ) : insights?.length ? (
        <div className="flex flex-col gap-3">
          {insights.map((insight, i) => (
            <InsightCard key={insight.id} insight={insight} index={i} />
          ))}
        </div>
      ) : (
        <div className="glass-card text-center py-10">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-surface-500 text-sm">No insights yet</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        {[
          { label: 'Can I afford this?', icon: '🛒', path: '/afford' },
          { label: 'Run a simulation',   icon: '🔮', path: '/simulate' },
        ].map(action => (
          <motion.button key={action.path} whileTap={{ scale: 0.96 }}
            onClick={() => navigate(action.path)}
            className="glass-card text-left">
            <span className="text-2xl block mb-2">{action.icon}</span>
            <span className="text-sm font-medium">{action.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
