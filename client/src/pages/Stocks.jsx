import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60, h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export default function Stocks() {
  const [stocks, setStocks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState('all'); // all | watchlist | gainers | losers
  const [tab, setTab] = useState('market'); // market | picks

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [mkt, wl] = await Promise.all([
        api.getMarket(),
        api.getWatchlist(),
      ]);
      setStocks(mkt.stocks || []);
      setWatchlist(wl.watchlist || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function getAIPicks() {
    if (stocks.length === 0) return;
    setAnalyzing(true);
    setTab('picks');
    try {
      const data = await api.analyzeStocks(stocks);
      setAnalysis(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function toggleWatchlist(symbol) {
    if (watchlist.includes(symbol)) {
      await api.removeFromWatchlist(symbol);
      setWatchlist(w => w.filter(s => s !== symbol));
    } else {
      await api.addToWatchlist(symbol);
      setWatchlist(w => [...w, symbol]);
    }
  }

  const filtered = stocks.filter(s => {
    if (filter === 'watchlist') return watchlist.includes(s.symbol);
    if (filter === 'gainers') return s.changePct > 0;
    if (filter === 'losers') return s.changePct < 0;
    return true;
  });

  const gainers = stocks.filter(s => s.changePct > 0).length;
  const losers = stocks.filter(s => s.changePct < 0).length;

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-1">Stock Market 📈</h1>
        <p className="text-surface-500 text-sm mb-4">Real-time prices · AI-powered picks</p>
      </motion.div>

      {/* Market mood bar */}
      {!loading && stocks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-card mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-surface-500">Market Today</p>
            <p className={`font-bold ${gainers > losers ? 'text-green-400' : 'text-red-400'}`}>
              {gainers > losers ? '📈 Mostly Up' : losers > gainers ? '📉 Mostly Down' : '➡️ Mixed'}
            </p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-green-400 font-bold text-lg">{gainers}</p>
              <p className="text-[10px] text-surface-500">Gaining</p>
            </div>
            <div>
              <p className="text-red-400 font-bold text-lg">{losers}</p>
              <p className="text-[10px] text-surface-500">Losing</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[{ id: 'market', label: 'Market' }, { id: 'picks', label: '🤖 AI Picks' }].map(t => (
          <button key={t.id} onClick={() => t.id === 'picks' ? getAIPicks() : setTab('market')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === t.id ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* AI Picks tab */}
      <AnimatePresence mode="wait">
        {tab === 'picks' && (
          <motion.div key="picks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {analyzing ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="text-4xl">🤖</motion.div>
                <p className="text-surface-500 text-sm">Claude is reading the market...</p>
              </div>
            ) : analysis ? (
              <div className="flex flex-col gap-4">
                {/* Market summary */}
                <div className="glass-card">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{analysis.marketMood === 'bullish' ? '🐂' : analysis.marketMood === 'bearish' ? '🐻' : '😐'}</span>
                    <p className="font-bold text-sm">Market Mood: {analysis.marketMood}</p>
                  </div>
                  <p className="text-surface-300 text-sm">{analysis.marketSummary}</p>
                </div>

                {/* Top picks */}
                <h2 className="font-bold text-sm">AI Top Picks</h2>
                {analysis.topPicks?.map((pick, i) => (
                  <motion.div key={pick.symbol} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }} className="glass-card">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{pick.emoji}</span>
                          <span className="font-bold">{pick.symbol}</span>
                          <span className={`pill text-[10px] ${pick.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' : pick.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' : 'bg-surface-600 text-surface-400'}`}>
                            {pick.sentiment}
                          </span>
                        </div>
                        <p className="text-xs text-surface-500">{pick.name}</p>
                      </div>
                      <span className={`pill text-[10px] ${pick.riskLevel === 'low' ? 'bg-green-500/15 text-green-400' : pick.riskLevel === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'}`}>
                        {pick.riskLevel} risk
                      </span>
                    </div>
                    <p className="text-sm text-surface-300">{pick.reason}</p>
                  </motion.div>
                ))}

                {/* Beginner tip */}
                <div className="glass-card border border-brand-500/20">
                  <p className="text-xs text-brand-400 font-medium mb-1">💡 Beginner Tip</p>
                  <p className="text-sm text-surface-300">{analysis.beginnerTip}</p>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-surface-600 text-center px-4">
                  ⚠️ {analysis.disclaimer}
                </p>
              </div>
            ) : null}
          </motion.div>
        )}

        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Filter chips */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {['all', 'watchlist', 'gainers', 'losers'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`pill text-xs whitespace-nowrap flex-shrink-0 ${filter === f ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
                  {f === 'watchlist' ? '⭐ Watchlist' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="glass-card h-16 bg-surface-700 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((stock, i) => {
                  const positive = stock.changePct >= 0;
                  const inWatchlist = watchlist.includes(stock.symbol);
                  return (
                    <motion.div key={stock.symbol} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="glass-card flex items-center gap-3 py-3">
                      {/* Watchlist star */}
                      <button onClick={() => toggleWatchlist(stock.symbol)}
                        className={`text-lg transition-colors ${inWatchlist ? 'text-yellow-400' : 'text-surface-600'}`}>
                        ★
                      </button>

                      {/* Stock info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{stock.symbol}</p>
                        <p className="text-[10px] text-surface-500 truncate">{stock.name}</p>
                      </div>

                      {/* Sparkline */}
                      <Sparkline data={stock.sparkline} positive={positive} />

                      {/* Price */}
                      <div className="text-right">
                        <p className="font-bold text-sm">${stock.price?.toFixed(2)}</p>
                        <p className={`text-xs font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
                          {positive ? '+' : ''}{stock.changePct?.toFixed(2)}%
                        </p>
                      </div>
                    </motion.div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="glass-card text-center py-10">
                    <p className="text-4xl mb-2">⭐</p>
                    <p className="text-surface-500 text-sm">
                      {filter === 'watchlist' ? 'No watchlist yet. Star stocks to add them.' : 'No stocks match this filter.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
