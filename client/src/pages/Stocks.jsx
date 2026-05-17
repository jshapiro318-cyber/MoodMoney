import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 64, h = 30;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const color = positive ? '#10b981' : '#ef4444';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={`sg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function ChangeBadge({ value }) {
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums
      ${pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function ImpactBadge({ impact, level }) {
  const cfg = {
    bullish: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', dot: '#10b981' },
    bearish: { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/25',     dot: '#ef4444' },
    neutral: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/25',   dot: '#f59e0b' },
  }[impact] || { bg: 'bg-surface-700', text: 'text-surface-400', border: 'border-surface-600', dot: '#71717a' };

  const levelLabel = { high: 'High', medium: 'Med', low: 'Low' }[level] || level;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {levelLabel} · {impact}
    </span>
  );
}

function SectorChip({ label }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-700 text-surface-400 border border-surface-600">
      {label}
    </span>
  );
}

function TickerChip({ symbol }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
      {symbol}
    </span>
  );
}

// ─── RSI mini-bar ─────────────────────────────────────────────────────────────
function RSIMini({ value }) {
  if (value == null) return null;
  const pct   = Math.min(100, Math.max(0, value));
  const color = value < 30 ? '#10b981' : value > 70 ? '#ef4444' : '#f97316';
  const label = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral';
  return (
    <div>
      <div className="flex justify-between text-[9px] mb-0.5 text-surface-500">
        <span>RSI {value}</span><span style={{ color }}>{label}</span>
      </div>
      <div className="h-1 bg-surface-700 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── AI pick card ─────────────────────────────────────────────────────────────
function PickCard({ pick, index }) {
  const [open, setOpen] = useState(false);
  const sc = pick.sentiment === 'bullish' ? {
    border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-400', pill: 'bg-emerald-500/15 text-emerald-400',
  } : pick.sentiment === 'bearish' ? {
    border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-400', pill: 'bg-red-500/15 text-red-400',
  } : {
    border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-400', pill: 'bg-amber-500/15 text-amber-400',
  };

  const rc = pick.riskLevel === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
             pick.riskLevel === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-2xl border p-4 ${sc.border} ${sc.bg}`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{pick.emoji}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-base tracking-tight">{pick.symbol}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${sc.pill}`}>
                {pick.sentiment}
              </span>
            </div>
            <p className="text-[11px] text-surface-500 mt-0.5">{pick.name}</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${rc}`}>
          {pick.riskLevel} risk
        </span>
      </div>

      {/* Candlestick pattern */}
      {pick.candlestickPattern && (
        <div className="bg-surface-800/70 rounded-xl p-3 mb-3 border border-surface-700/50">
          <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase mb-1">🕯 Pattern Detected</p>
          <p className="text-sm font-bold text-white mb-0.5">{pick.candlestickPattern}</p>
          <p className="text-xs text-surface-400 leading-relaxed">{pick.candlestickMeaning}</p>
        </div>
      )}

      {/* Signal chips row */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: 'RSI', val: pick.rsiSignal?.split(':')[0] || pick.rsiSignal },
          { label: 'MA', val: pick.movingAverageSignal?.split(',')[0] },
          { label: 'VOL', val: pick.volumeSignal?.split('.')[0] },
        ].filter(x => x.val).map(({ label, val }) => (
          <div key={label} className="bg-surface-800/70 rounded-lg p-2 border border-surface-700/50">
            <p className="text-[8px] font-black tracking-widest text-surface-500 uppercase mb-0.5">{label}</p>
            <p className="text-[10px] text-surface-200 leading-tight line-clamp-2">{val}</p>
          </div>
        ))}
      </div>

      {/* Analysis */}
      <p className="text-sm text-surface-300 leading-relaxed mb-3">{pick.overallAnalysis}</p>

      {/* Expand toggle */}
      <button onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-semibold ${sc.text}`}>
        {open ? '▲ Hide details' : '▼ Full breakdown'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-2 pt-3">
              {[
                { label: '📅 1–2 Week Outlook', val: pick.shortTermOutlook, accent: 'text-amber-400' },
                { label: '🎯 Key Levels', val: pick.keyLevels, accent: 'text-purple-400' },
                { label: 'RSI Detail', val: pick.rsiSignal, accent: 'text-surface-400' },
                { label: 'Moving Averages', val: pick.movingAverageSignal, accent: 'text-surface-400' },
                { label: 'Volume Detail', val: pick.volumeSignal, accent: 'text-surface-400' },
              ].filter(x => x.val).map(({ label, val, accent }) => (
                <div key={label} className="bg-surface-800/70 rounded-xl p-3 border border-surface-700/50">
                  <p className={`text-[9px] font-black tracking-widest uppercase mb-1 ${accent}`}>{label}</p>
                  <p className="text-xs text-surface-300 leading-relaxed">{val}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── News event card ──────────────────────────────────────────────────────────
function EventCard({ event, index }) {
  const [open, setOpen] = useState(false);
  const ic = event.impact === 'bullish' ? {
    bar: 'bg-emerald-500', border: 'border-emerald-500/20', glow: 'bg-emerald-500/5',
  } : event.impact === 'bearish' ? {
    bar: 'bg-red-500', border: 'border-red-500/20', glow: 'bg-red-500/5',
  } : {
    bar: 'bg-amber-400', border: 'border-amber-400/20', glow: 'bg-amber-400/5',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`relative rounded-2xl border overflow-hidden ${ic.border} ${ic.glow}`}>

      {/* Impact accent bar on left */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${ic.bar}`} />

      <div className="pl-4 pr-4 pt-4 pb-3 ml-1">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg leading-none">{event.emoji}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600">
              {event.category}
            </span>
          </div>
          <ImpactBadge impact={event.impact} level={event.impactLevel} />
        </div>

        {/* Headline */}
        <p className="text-sm font-bold text-white leading-snug mb-2">{event.headline}</p>

        {/* Summary */}
        <p className="text-xs text-surface-400 leading-relaxed mb-3">{event.summary}</p>

        {/* Sectors + tickers */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {event.sectors?.map(s => <SectorChip key={s} label={s} />)}
        </div>
        {event.watchTickers?.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] text-surface-600 font-bold tracking-widest uppercase">Watch</span>
            {event.watchTickers.map(t => <TickerChip key={t} symbol={t} />)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Stocks() {
  const [stocks, setStocks]           = useState([]);
  const [analysis, setAnalysis]       = useState(null);
  const [news, setNews]               = useState(null);
  const [watchlist, setWatchlist]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [analyzing, setAnalyzing]     = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [filter, setFilter]           = useState('all');
  const [tab, setTab]                 = useState('market');
  const [query, setQuery]             = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching]     = useState(false);
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
    setTab('analysis');
    try {
      const data = await api.analyzeStocks(stocks.slice(0, 5).map(s => s.symbol));
      setAnalysis(data);
    } catch (err) { console.error(err); }
    finally { setAnalyzing(false); }
  }

  async function loadNews() {
    if (loadingNews) return;
    setLoadingNews(true);
    setTab('events');
    try {
      const data = await api.getStockNews();
      setNews(data);
    } catch (err) { console.error(err); }
    finally { setLoadingNews(false); }
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
  const moodUp  = gainers > losers;

  return (
    <div className="screen-card pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-surface-500 uppercase mb-0.5">Markets</p>
            <h1 className="text-2xl font-black tracking-tight">Stock Market</h1>
          </div>
          <span className="text-2xl">{moodUp ? '📈' : '📉'}</span>
        </div>
      </motion.div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-sm">⌕</span>
          <input type="text" value={query} onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search any ticker — AAPL, BTC-USD, SPY…"
            className="w-full bg-surface-800/80 border border-surface-700 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:border-brand-500 transition-colors" />
          {searching && (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-surface-500 inline-block">◌</motion.span>
          )}
        </div>

        <AnimatePresence>
          {searchResult && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-2 bg-surface-800 border border-surface-700 rounded-xl flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleWatchlist(searchResult.symbol)}
                className={`text-lg transition-colors ${watchlist.includes(searchResult.symbol) ? 'text-yellow-400' : 'text-surface-600 hover:text-surface-400'}`}>★</button>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{searchResult.symbol}</p>
                <p className="text-[10px] text-surface-500 truncate">{searchResult.name}</p>
              </div>
              <Sparkline data={searchResult.sparkline} positive={searchResult.changePct >= 0} />
              <div className="text-right">
                <p className="font-bold text-sm tabular-nums">${searchResult.price?.toFixed(2)}</p>
                <div className="flex justify-end mt-0.5">
                  <ChangeBadge value={searchResult.changePct} />
                </div>
              </div>
            </motion.div>
          )}
          {searchError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-1.5 text-xs text-red-400 pl-1">{searchError}</motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Market pulse bar ──────────────────────────────────────────── */}
      {!loading && stocks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-surface-800/60 border border-surface-700 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase mb-0.5">Market Pulse</p>
            <p className={`font-bold text-sm ${moodUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {moodUp ? 'Mostly bullish today' : gainers === losers ? 'Mixed signals' : 'Mostly bearish today'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-emerald-400 font-black text-lg tabular-nums leading-none">{gainers}</p>
              <p className="text-[9px] text-surface-500 font-medium">UP</p>
            </div>
            <div className="w-px h-8 bg-surface-700" />
            <div className="text-center">
              <p className="text-red-400 font-black text-lg tabular-nums leading-none">{losers}</p>
              <p className="text-[9px] text-surface-500 font-medium">DOWN</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-5 bg-surface-800/60 p-1 rounded-xl border border-surface-700">
        {[
          { id: 'market',   label: 'Market',    action: () => setTab('market') },
          { id: 'analysis', label: '🤖 Analysis', action: getAIPicks },
          { id: 'events',   label: '📰 Events',   action: loadNews },
        ].map(t => (
          <button key={t.id} onClick={t.action}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === t.id
                ? 'bg-surface-700 text-white shadow-sm'
                : 'text-surface-500 hover:text-surface-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* MARKET ─────────────────────────────────────────────────────── */}
        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Filter chips */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {[['all','All'],['watchlist','⭐ Watchlist'],['gainers','▲ Gainers'],['losers','▼ Losers']].map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    filter === f ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-500 border border-surface-700'
                  }`}>{label}</button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl bg-surface-800 animate-pulse" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((stock, i) => {
                  const pos = stock.changePct >= 0;
                  const inWL = watchlist.includes(stock.symbol);
                  return (
                    <motion.div key={stock.symbol}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="bg-surface-800/60 border border-surface-700/60 rounded-xl flex items-center gap-3 px-3 py-3 hover:border-surface-600 transition-colors">

                      <button onClick={() => toggleWatchlist(stock.symbol)}
                        className={`text-base leading-none transition-colors flex-shrink-0 ${inWL ? 'text-yellow-400' : 'text-surface-700 hover:text-surface-500'}`}>★</button>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm tracking-tight">{stock.symbol}</p>
                        <p className="text-[10px] text-surface-500 truncate">{stock.name}</p>
                      </div>

                      <Sparkline data={stock.sparkline} positive={pos} />

                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-sm tabular-nums">${stock.price?.toFixed(2)}</p>
                        <div className="flex justify-end mt-0.5">
                          <ChangeBadge value={stock.changePct} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="text-center py-12 text-surface-500">
                    <p className="text-3xl mb-2">{filter === 'watchlist' ? '⭐' : '🔍'}</p>
                    <p className="text-sm">
                      {filter === 'watchlist' ? 'No watchlist yet — star a stock to add it' : 'No stocks match this filter'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* AI ANALYSIS ─────────────────────────────────────────────── */}
        {tab === 'analysis' && (
          <motion.div key="analysis" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {analyzing ? (
              <div className="flex flex-col items-center gap-4 py-14">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-14 h-14 rounded-full border-2 border-brand-500 border-t-transparent" />
                <div className="text-center">
                  <p className="font-bold text-sm mb-1">Running deep analysis…</p>
                  <p className="text-surface-500 text-xs">Fetching live OHLCV data · Reading candlesticks</p>
                  <p className="text-surface-500 text-xs">RSI · Moving averages · Volume trends</p>
                  <p className="text-surface-600 text-xs mt-2">~15–20 seconds</p>
                </div>
              </div>
            ) : analysis ? (
              <div className="flex flex-col gap-4">

                {/* Market mood */}
                <div className="bg-surface-800/60 border border-surface-700 rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-3xl">
                    {analysis.marketMood === 'bullish' ? '🐂' : analysis.marketMood === 'bearish' ? '🐻' : '😐'}
                  </span>
                  <div className="flex-1">
                    <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase mb-0.5">Market Mood</p>
                    <p className="font-black text-sm capitalize">{analysis.marketMood}</p>
                    <p className="text-xs text-surface-400 leading-snug mt-0.5">{analysis.marketSummary}</p>
                  </div>
                </div>

                {/* Pattern of the day */}
                {analysis.patternOfTheDay && (
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4">
                    <p className="text-[9px] font-black tracking-widest text-purple-400 uppercase mb-2">🕯 Pattern of the Day</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="font-black text-sm text-white">{analysis.patternOfTheDay.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-700 text-surface-400">{analysis.patternOfTheDay.stock}</span>
                    </div>
                    <p className="text-xs text-surface-400 leading-relaxed">{analysis.patternOfTheDay.explanation}</p>
                  </div>
                )}

                {/* Top picks */}
                <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase">Top Picks</p>
                {analysis.topPicks?.map((pick, i) => <PickCard key={pick.symbol} pick={pick} index={i} />)}

                {/* Chart tip */}
                {analysis.beginnerTip && (
                  <div className="bg-brand-500/5 border border-brand-500/20 rounded-2xl p-4">
                    <p className="text-[9px] font-black tracking-widest text-brand-400 uppercase mb-1">💡 Chart Tip</p>
                    <p className="text-sm text-surface-300">{analysis.beginnerTip}</p>
                  </div>
                )}

                {analysis.stocksAnalyzed && (
                  <p className="text-[10px] text-surface-600 text-center">
                    Analyzed: {analysis.stocksAnalyzed.join(' · ')}
                  </p>
                )}

                <p className="text-[10px] text-surface-600 text-center px-4 leading-relaxed">
                  ⚠️ {analysis.disclaimer}
                </p>

                <button onClick={getAIPicks}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white hover:border-surface-600 transition-all">
                  🔄 Re-analyze
                </button>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* EVENTS ───────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <motion.div key="events" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {loadingNews ? (
              <div className="flex flex-col items-center gap-4 py-14">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-14 h-14 rounded-full border-2 border-brand-500 border-t-transparent" />
                <div className="text-center">
                  <p className="font-bold text-sm mb-1">Scanning the news…</p>
                  <p className="text-surface-500 text-xs">Pulling headlines · AI market analysis</p>
                  <p className="text-surface-600 text-xs mt-2">~15 seconds</p>
                </div>
              </div>
            ) : news ? (
              <div className="flex flex-col gap-4">

                {/* Market pulse summary */}
                <div className={`rounded-2xl p-4 border ${
                  news.fearGreed === 'greed' ? 'bg-emerald-500/5 border-emerald-500/20' :
                  news.fearGreed === 'fear'  ? 'bg-red-500/5 border-red-500/20' :
                                               'bg-amber-400/5 border-amber-400/20'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase">Today's Market Pulse</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md capitalize ${
                      news.fearGreed === 'greed' ? 'bg-emerald-500/15 text-emerald-400' :
                      news.fearGreed === 'fear'  ? 'bg-red-500/15 text-red-400' :
                                                   'bg-amber-400/15 text-amber-400'
                    }`}>{news.fearGreed === 'greed' ? '😤 Greed' : news.fearGreed === 'fear' ? '😨 Fear' : '😐 Neutral'}</span>
                  </div>
                  <p className="text-sm font-bold text-white leading-snug">{news.marketPulse}</p>
                  {news.hotSector && (
                    <p className="text-xs text-surface-500 mt-1">Hot sector: <span className="text-white font-medium">{news.hotSector}</span></p>
                  )}
                </div>

                {/* Updated time */}
                {news.fetchedAt && (
                  <p className="text-[10px] text-surface-600 -mt-1">
                    Updated {new Date(news.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}

                {/* Event cards */}
                <p className="text-[9px] font-black tracking-widest text-surface-500 uppercase">Current Events</p>
                {news.events?.map((event, i) => <EventCard key={i} event={event} index={i} />)}

                <button onClick={loadNews}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white hover:border-surface-600 transition-all">
                  🔄 Refresh news
                </button>

                <p className="text-[10px] text-surface-600 text-center leading-relaxed px-4">
                  ⚠️ AI-generated news analysis. Not financial advice. Always verify with primary sources.
                </p>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
