import { useState, useEffect, useRef } from 'react';
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

function RSIBar({ value }) {
  if (value == null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const color = value < 30 ? '#10b981' : value > 70 ? '#ef4444' : '#f97316';
  const label = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral';
  return (
    <div className="mt-1">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-surface-500">RSI {value}</span>
        <span style={{ color }}>{label}</span>
      </div>
      <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: color }} />
      </div>
    </div>
  );
}

function PickCard({ pick, index }) {
  const [expanded, setExpanded] = useState(false);
  const sentimentColor = pick.sentiment === 'bullish' ? 'text-green-400' : pick.sentiment === 'bearish' ? 'text-red-400' : 'text-yellow-400';
  const sentimentBg   = pick.sentiment === 'bullish' ? 'bg-green-500/15 border-green-500/20' : pick.sentiment === 'bearish' ? 'bg-red-500/15 border-red-500/20' : 'bg-yellow-500/15 border-yellow-500/20';
  const riskColor     = pick.riskLevel === 'low' ? 'text-green-400 bg-green-500/15' : pick.riskLevel === 'medium' ? 'text-yellow-400 bg-yellow-500/15' : 'text-red-400 bg-red-500/15';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12 }}
      className={`glass-card border ${sentimentBg}`}>

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{pick.emoji}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-base">{pick.symbol}</span>
              <span className={`pill text-[10px] ${sentimentColor} bg-current/10`}>{pick.sentiment}</span>
            </div>
            <p className="text-[10px] text-surface-500">{pick.name}</p>
          </div>
        </div>
        <span className={`pill text-[10px] ${riskColor}`}>{pick.riskLevel} risk</span>
      </div>

      {/* Candlestick pattern */}
      {pick.candlestickPattern && (
        <div className="bg-surface-800/60 rounded-xl p-3 mb-3">
          <p className="text-[10px] text-brand-400 font-bold mb-0.5">🕯️ CANDLESTICK PATTERN</p>
          <p className="text-sm font-bold mb-0.5">{pick.candlestickPattern}</p>
          <p className="text-xs text-surface-400 leading-relaxed">{pick.candlestickMeaning}</p>
        </div>
      )}

      {/* Signal row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {pick.rsiSignal && (
          <div className="bg-surface-800/60 rounded-lg p-2">
            <p className="text-[9px] text-surface-500 font-bold mb-0.5">RSI</p>
            <p className="text-[10px] text-surface-200 leading-tight">{pick.rsiSignal?.split(':')[0] || pick.rsiSignal}</p>
          </div>
        )}
        {pick.movingAverageSignal && (
          <div className="bg-surface-800/60 rounded-lg p-2">
            <p className="text-[9px] text-surface-500 font-bold mb-0.5">MAs</p>
            <p className="text-[10px] text-surface-200 leading-tight line-clamp-2">{pick.movingAverageSignal?.split(',')[0] || pick.movingAverageSignal}</p>
          </div>
        )}
        {pick.volumeSignal && (
          <div className="bg-surface-800/60 rounded-lg p-2">
            <p className="text-[9px] text-surface-500 font-bold mb-0.5">Volume</p>
            <p className="text-[10px] text-surface-200 leading-tight line-clamp-2">{pick.volumeSignal?.split('.')[0] || pick.volumeSignal}</p>
          </div>
        )}
      </div>

      {/* Analysis */}
      <p className="text-sm text-surface-300 leading-relaxed mb-2">{pick.overallAnalysis}</p>

      {/* Expand toggle */}
      <button onClick={() => setExpanded(e => !e)}
        className="text-[11px] text-brand-400 font-medium mb-2">
        {expanded ? '▲ Less detail' : '▼ More detail'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-2 pt-1">
              {pick.shortTermOutlook && (
                <div className="bg-surface-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-yellow-400 font-bold mb-0.5">📅 1–2 WEEK OUTLOOK</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{pick.shortTermOutlook}</p>
                </div>
              )}
              {pick.keyLevels && (
                <div className="bg-surface-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-purple-400 font-bold mb-0.5">🎯 KEY LEVELS</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{pick.keyLevels}</p>
                </div>
              )}
              {pick.rsiSignal && (
                <div className="bg-surface-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-surface-500 font-bold mb-0.5">RSI SIGNAL</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{pick.rsiSignal}</p>
                </div>
              )}
              {pick.movingAverageSignal && (
                <div className="bg-surface-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-surface-500 font-bold mb-0.5">MOVING AVERAGES</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{pick.movingAverageSignal}</p>
                </div>
              )}
              {pick.volumeSignal && (
                <div className="bg-surface-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-surface-500 font-bold mb-0.5">VOLUME ANALYSIS</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{pick.volumeSignal}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Stocks() {
  const [stocks, setStocks]         = useState([]);
  const [analysis, setAnalysis]     = useState(null);
  const [watchlist, setWatchlist]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [analyzing, setAnalyzing]   = useState(false);
  const [filter, setFilter]         = useState('all');
  const [tab, setTab]               = useState('market');
  const [query, setQuery]           = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimeout = useRef(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [mkt, wl] = await Promise.all([api.getMarket(), api.getWatchlist()]);
      setStocks(mkt.stocks || []);
      setWatchlist(wl.watchlist || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function handleQueryChange(val) {
    setQuery(val);
    setSearchError('');
    if (!val.trim()) { setSearchResult(null); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(val.trim().toUpperCase()), 600);
  }

  async function doSearch(sym) {
    setSearching(true);
    setSearchResult(null);
    try {
      const data = await api.searchStock(sym);
      setSearchResult(data.stock);
    } catch {
      setSearchError(`No data found for "${sym}"`);
    } finally { setSearching(false); }
  }

  async function getAIPicks() {
    if (analyzing) return;
    setAnalyzing(true);
    setTab('picks');
    try {
      const data = await api.analyzeStocks(stocks.slice(0, 8).map(s => s.symbol));
      setAnalysis(data);
    } catch (err) { console.error(err); }
    finally { setAnalyzing(false); }
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
    if (filter === 'gainers')   return s.changePct > 0;
    if (filter === 'losers')    return s.changePct < 0;
    return true;
  });

  const gainers = stocks.filter(s => s.changePct > 0).length;
  const losers  = stocks.filter(s => s.changePct < 0).length;

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-1">Stock Market 📈</h1>
        <p className="text-surface-500 text-sm mb-4">Real-time prices · AI technical analysis</p>
      </motion.div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search any ticker… AAPL, BTC-USD, SPY"
            className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:border-brand-500"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-500">...</span>
          )}
        </div>

        {/* Search result */}
        <AnimatePresence>
          {searchResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-2 glass-card flex items-center gap-3 py-3">
              <button onClick={() => toggleWatchlist(searchResult.symbol)}
                className={`text-lg ${watchlist.includes(searchResult.symbol) ? 'text-yellow-400' : 'text-surface-600'}`}>★</button>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{searchResult.symbol}</p>
                <p className="text-[10px] text-surface-500 truncate">{searchResult.name}</p>
              </div>
              <Sparkline data={searchResult.sparkline} positive={searchResult.changePct >= 0} />
              <div className="text-right">
                <p className="font-bold text-sm">${searchResult.price?.toFixed(2)}</p>
                <p className={`text-xs font-medium ${searchResult.changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {searchResult.changePct >= 0 ? '+' : ''}{searchResult.changePct?.toFixed(2)}%
                </p>
              </div>
            </motion.div>
          )}
          {searchError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-2 text-xs text-red-400 pl-1">{searchError}</motion.p>
          )}
        </AnimatePresence>
      </div>

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
        <button onClick={() => setTab('market')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === 'market' ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
          Market
        </button>
        <button onClick={getAIPicks}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === 'picks' ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
          🤖 AI Deep Analysis
        </button>
      </div>

      <AnimatePresence mode="wait">

        {/* ── AI PICKS TAB ────────────────────────────────────────────── */}
        {tab === 'picks' && (
          <motion.div key="picks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {analyzing ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="text-5xl">🤖</motion.div>
                <p className="font-bold text-sm">Reading the charts...</p>
                <p className="text-surface-500 text-xs text-center">Fetching live data + AI analysis<br/>Takes about 15–20 seconds</p>
                <div className="flex gap-1 mt-2">
                  {['📊','🕯️','📈','🔍'].map((e, i) => (
                    <motion.span key={i} className="text-xl"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}>{e}</motion.span>
                  ))}
                </div>
              </div>
            ) : analysis ? (
              <div className="flex flex-col gap-4">

                {/* Market mood */}
                <div className="glass-card flex items-center gap-3">
                  <span className="text-3xl">
                    {analysis.marketMood === 'bullish' ? '🐂' : analysis.marketMood === 'bearish' ? '🐻' : '😐'}
                  </span>
                  <div>
                    <p className="font-bold text-sm capitalize">Market is {analysis.marketMood}</p>
                    <p className="text-xs text-surface-400 leading-relaxed">{analysis.marketSummary}</p>
                  </div>
                </div>

                {/* Pattern of the day */}
                {analysis.patternOfTheDay && (
                  <div className="glass-card border border-purple-500/20 bg-purple-500/5">
                    <p className="text-[10px] text-purple-400 font-bold mb-1">🕯️ PATTERN OF THE DAY</p>
                    <p className="font-bold text-sm mb-0.5">{analysis.patternOfTheDay.name}
                      <span className="text-surface-500 font-normal text-xs"> · {analysis.patternOfTheDay.stock}</span>
                    </p>
                    <p className="text-xs text-surface-400 leading-relaxed">{analysis.patternOfTheDay.explanation}</p>
                  </div>
                )}

                {/* Top picks */}
                <p className="font-bold text-sm text-surface-400">TOP PICKS THIS ANALYSIS</p>
                {analysis.topPicks?.map((pick, i) => (
                  <PickCard key={pick.symbol} pick={pick} index={i} />
                ))}

                {/* Beginner tip */}
                {analysis.beginnerTip && (
                  <div className="glass-card border border-brand-500/20 bg-brand-500/5">
                    <p className="text-[10px] text-brand-400 font-bold mb-1">💡 CHART TIP</p>
                    <p className="text-sm text-surface-300">{analysis.beginnerTip}</p>
                  </div>
                )}

                {/* Stocks analyzed */}
                {analysis.stocksAnalyzed && (
                  <p className="text-[10px] text-surface-600 text-center">
                    Analyzed: {analysis.stocksAnalyzed.join(' · ')}
                  </p>
                )}

                {/* Disclaimer */}
                <p className="text-[10px] text-surface-600 text-center px-2">
                  ⚠️ {analysis.disclaimer}
                </p>

                {/* Refresh */}
                <button onClick={getAIPicks}
                  className="btn-secondary text-xs py-2">
                  🔄 Re-analyze Market
                </button>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* ── MARKET TAB ──────────────────────────────────────────────── */}
        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {[['all','All'],['watchlist','⭐ Watchlist'],['gainers','🟢 Gainers'],['losers','🔴 Losers']].map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`pill text-xs whitespace-nowrap flex-shrink-0 ${filter === f ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[1,2,3,4,5].map(i => <div key={i} className="glass-card h-16 animate-pulse bg-surface-700" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((stock, i) => {
                  const positive    = stock.changePct >= 0;
                  const inWatchlist = watchlist.includes(stock.symbol);
                  return (
                    <motion.div key={stock.symbol} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.025 }}
                      className="glass-card flex items-center gap-3 py-3">
                      <button onClick={() => toggleWatchlist(stock.symbol)}
                        className={`text-lg transition-colors ${inWatchlist ? 'text-yellow-400' : 'text-surface-600'}`}>
                        ★
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{stock.symbol}</p>
                        <p className="text-[10px] text-surface-500 truncate">{stock.name}</p>
                      </div>
                      <Sparkline data={stock.sparkline} positive={positive} />
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
