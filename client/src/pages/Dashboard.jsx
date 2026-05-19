import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { useProfile } from '../lib/hooks.js';
import InsightCard from '../components/InsightCard.jsx';
import AlertBanner from '../components/AlertBanner.jsx';
import XPBar from '../components/XPBar.jsx';
import PlaidConnect from '../components/PlaidConnect.jsx';
import Icon from '../components/Icon.jsx';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return <div className="skeleton h-[72px] w-full" />;
}

// ─── Quick action ─────────────────────────────────────────────────────────────
function QuickAction({ icon, label, sub, onClick }) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className="flex items-start gap-3 p-3.5 rounded-2xl text-left transition-all hover:brightness-110 active:scale-[0.98]"
      style={{
        background: 'linear-gradient(145deg, #161622 0%, #111118 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.2)' }}>
        <Icon name={icon} size={15} className="text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-tight tracking-tight">{label}</p>
        {sub && <p className="text-xs mt-0.5 leading-tight" style={{ color: '#606078' }}>{sub}</p>}
      </div>
    </motion.button>
  );
}

// ─── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const color = score > 70 ? '#f87171' : score > 40 ? '#fbbf24' : '#34d399';
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1c1c2c" strokeWidth="2.5" />
        <motion.circle cx="18" cy="18" r="15.9" fill="none"
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          initial={{ strokeDasharray: '0 100' }}
          animate={{ strokeDasharray: `${score} 100` }}
          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const [insights, setInsights]     = useState(null);
  const [alerts, setAlerts]         = useState([]);
  const [emotionalScore, setEmotionalScore] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!profileLoading && profile) {
      if (!profile.onboarding_completed) { navigate('/onboarding'); return; }
      loadData();
    }
  }, [profile, profileLoading]);

  async function loadData(forceRefresh = false) {
    try {
      const txData = await api.getCachedTransactions(60);
      const txns = txData.transactions || [];
      if (!forceRefresh) {
        try {
          const sb = (await import('../lib/supabase.js')).supabase;
          const { data: cached } = await sb
            .from('spending_analyses').select('analysis, analyzed_at').single();
          if (cached?.analysis) {
            setInsights(cached.analysis.insights || []);
            setEmotionalScore(cached.analysis.emotionalScore);
            setLastUpdated(new Date(cached.analyzed_at));
            setLoading(false);
            const age = Date.now() - new Date(cached.analyzed_at).getTime();
            if (age > 60 * 60 * 1000) runAIAnalysis(txns, true);
            loadAlerts(txns);
            return;
          }
        } catch (_) {}
      }
      setLoading(true);
      await runAIAnalysis(txns, false);
      loadAlerts(txns);
    } catch (err) {
      console.error(err);
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
      console.error(err);
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.display_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'there';

  return (
    <div className="screen-card pb-32">

      {/* ── Header ───────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-7">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: '#606078' }}>{greeting}</p>
          <h1 className="text-[28px] font-black tracking-tight leading-none capitalize"
            style={{ letterSpacing: '-0.03em' }}>{firstName}</h1>
        </div>
        <button onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)',
            boxShadow: '0 4px 16px rgba(249,115,22,0.35)',
          }}>
          {(profile?.display_name?.[0] || profile?.email?.[0] || 'U').toUpperCase()}
        </button>
      </motion.div>

      {/* ── XP bar ───────────────────────────────────────── */}
      <XPBar />

      {/* ── Personality ──────────────────────────────────── */}
      {profile?.personality_type && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-5">
          <span className="pill" style={{
            background: 'rgba(249,115,22,0.1)',
            border: '1px solid rgba(249,115,22,0.2)',
            color: '#fb923c',
          }}>
            <Icon name="sparkles" size={10} />
            {profile.personality_type}
          </span>
          {refreshing && (
            <span className="text-xs flex items-center gap-1.5" style={{ color: '#606078' }}>
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">
                <Icon name="refresh" size={11} />
              </motion.span>
              Refreshing…
            </span>
          )}
        </motion.div>
      )}

      {/* ── Emotional score ───────────────────────────────── */}
      {emotionalScore !== null && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="glass-card mb-5 flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="label mb-2">Emotional Spending Score</p>
            <p className="text-4xl font-black text-gradient nums mb-1" style={{ letterSpacing: '-0.04em' }}>
              {emotionalScore}
              <span className="text-base font-medium" style={{ color: '#606078' }}>/100</span>
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#70708a' }}>
              {emotionalScore > 70 ? 'Emotions driving most purchases' :
               emotionalScore > 40 ? 'Mixed — some emotional, some intentional' :
               'Spending with intention — great discipline'}
            </p>
          </div>
          <ScoreRing score={emotionalScore} />
        </motion.div>
      )}

      {/* ── Alerts ───────────────────────────────────────── */}
      <AnimatePresence>
        {alerts.map(alert => <AlertBanner key={alert.id} alert={alert} />)}
      </AnimatePresence>

      {/* ── Insights ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-white tracking-tight">Insights</p>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs nums" style={{ color: '#50505e' }}>
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => loadData(true)} disabled={refreshing || loading}
            className="flex items-center gap-1 text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ color: '#fb923c' }}>
            <Icon name="refresh" size={11} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1,2,3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : insights?.length ? (
        <div className="flex flex-col gap-2.5">
          {insights.map((insight, i) => (
            <motion.div key={insight.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}>
              <InsightCard insight={insight} index={i} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass-card flex flex-col items-center py-12 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Icon name="sparkles" size={20} style={{ color: '#50505e' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white mb-1">No insights yet</p>
            <p className="text-xs" style={{ color: '#606078' }}>Connect your bank to unlock AI insights</p>
          </div>
        </div>
      )}

      {/* ── Bank ──────────────────────────────────────────── */}
      <div className="mt-5">
        <PlaidConnect
          bankConnected={profile?.bank_connected}
          institutionName={profile?.institution_name}
          onSuccess={() => loadData(true)}
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="mt-6">
        <p className="label mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction icon="wallet"      label="Can I Afford This?" sub="Check your budget"  onClick={() => navigate('/afford')} />
          <QuickAction icon="chart-line"  label="Simulation"        sub="Model scenarios"    onClick={() => navigate('/simulate')} />
          <QuickAction icon="bar-chart"   label="Spending"          sub="View breakdown"     onClick={() => navigate('/spending')} />
          <QuickAction icon="trending-up" label="Grow My Money"     sub="Investment ideas"   onClick={() => navigate('/grow')} />
        </div>
      </div>

    </div>
  );
}
