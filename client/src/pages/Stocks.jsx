import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

// ─── Micro components ─────────────────────────────────────────────────────────

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 56, H = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ');
  const color = positive ? '#22c55e' : '#ef4444';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function Pct({ value }) {
  const pos = value >= 0;
  return (
    <span className={`text-xs font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
}

function Tag({ children, color = 'zinc' }) {
  const cls = {
    bullish:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    bearish:  'bg-red-500/10 text-red-400 border-red-500/20',
    neutral:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high:     'bg-red-500/10 text-red-400 border-red-500/20',
    medium:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    brand:    'bg-brand-500/10 text-brand-400 border-brand-500/20',
    zinc:     'bg-surface-700 text-surface-400 border-surface-600',
    purple:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }[color] || 'bg-surface-700 text-surface-400 border-surface-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}>
      {children}
    </span>
  );
}

function Label({ children }) {
  return <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1">{children}</p>;
}

function Divider() {
  return <div className="h-px bg-surface-700 my-4" />;
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm font-semibold text-white">{message || 'Something went wrong'}</p>
      <p className="text-xs text-surface-500">Check your connection and try again</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-1 px-5 py-2 rounded-xl bg-surface-800 border border-surface-600 text-xs font-bold text-white hover:border-surface-500 transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

function Loader({ label, sub }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14">
      <div className="relative w-10 h-10">
        <motion.div className="absolute inset-0 rounded-full border-2 border-surface-700" />
        <motion.div className="absolute inset-0 rounded-full border-2 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{label}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── AI pick card ─────────────────────────────────────────────────────────────
function PickCard({ pick, index }) {
  const [open, setOpen] = useState(false);
  const sc = pick.sentiment === 'bullish' ? 'bullish' : pick.sentiment === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">

      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />

      <div className="pl-4 pr-4 pt-4 pb-4 ml-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{pick.emoji}</span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-black text-base tracking-tight">{pick.symbol}</span>
                <Tag color={sc}>{pick.sentiment}</Tag>
              </div>
              <p className="text-[11px] text-surface-500">{pick.name}</p>
            </div>
          </div>
          <Tag color={pick.riskLevel}>{pick.riskLevel} risk</Tag>
        </div>

        {/* Candlestick pattern */}
        {pick.candlestickPattern && (
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-3 mb-3">
            <Label>🕯 Candlestick Pattern</Label>
            <p className="text-sm font-bold text-white">{pick.candlestickPattern}</p>
            <p className="text-xs text-surface-400 leading-relaxed mt-0.5">{pick.candlestickMeaning}</p>
          </div>
        )}

        {/* Signal row */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[
            { lbl: 'RSI',    val: pick.rsiSignal?.split(':')[0] || pick.rsiSignal },
            { lbl: 'MA',     val: pick.movingAverageSignal?.split(',')[0] },
            { lbl: 'Volume', val: pick.volumeSignal?.split('.')[0] },
          ].filter(x => x.val).map(({ lbl, val }) => (
            <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2">
              <Label>{lbl}</Label>
              <p className="text-[10px] text-surface-300 leading-tight line-clamp-2">{val}</p>
            </div>
          ))}
        </div>

        {/* Analysis */}
        <p className="text-sm text-surface-300 leading-relaxed mb-3">{pick.overallAnalysis}</p>

        {/* Expand */}
        <button onClick={() => setOpen(o => !o)}
          className="text-[11px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
          {open ? '↑ Less' : '↓ Full breakdown'}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-3 border-t border-surface-700 mt-3">
                {[
                  { lbl: '📅 1–2 Week Outlook',  val: pick.shortTermOutlook, c: 'neutral' },
                  { lbl: '🎯 Key Levels',          val: pick.keyLevels, c: 'purple' },
                  { lbl: 'Full RSI Signal',        val: pick.rsiSignal, c: 'zinc' },
                  { lbl: 'Moving Averages',        val: pick.movingAverageSignal, c: 'zinc' },
                  { lbl: 'Volume Analysis',        val: pick.volumeSignal, c: 'zinc' },
                ].filter(x => x.val).map(({ lbl, val }) => (
                  <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-xl p-3">
                    <Label>{lbl}</Label>
                    <p className="text-xs text-surface-300 leading-relaxed">{val}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── News event card ──────────────────────────────────────────────────────────
function EventCard({ event, index }) {
  const sc = event.impact === 'bullish' ? 'bullish' : event.impact === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">

      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />

      <div className="pl-4 pr-4 pt-3.5 pb-3.5 ml-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base leading-none">{event.emoji}</span>
            <Tag color="zinc">{event.category}</Tag>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Tag color={event.impactLevel === 'high' ? 'high' : event.impactLevel === 'medium' ? 'medium' : 'low'}>
              {event.impactLevel}
            </Tag>
            <Tag color={sc}>{event.impact}</Tag>
          </div>
        </div>

        <p className="text-sm font-bold text-white leading-snug mb-2">{event.headline}</p>
        <p className="text-xs text-surface-400 leading-relaxed mb-3">{event.summary}</p>

        <div className="flex flex-wrap gap-1.5">
          {event.sectors?.map(s => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600 font-medium">{s}</span>
          ))}
          {event.watchTickers?.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-bold">{t}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Stocks() {
  const [stocks, setStocks]             = useState([]);
  const [analysis, setAnalysis]         = useState(null);
  const [news, setNews]                 = useState(null);
  const [watchlist, setWatchlist]       = useState([]);
  const [loadingMkt, setLoadingMkt]     = useState(true);
  const [loadingAI, setLoadingAI]       = useState(false);
  const [loadingNews, setLoadingNews]   = useState(false);
  const [errAI, setErrAI]               = useState('');
  const [errNews, setErrNews]           = useState('');
  const [filter, setFilter]             = useState('all');
  const [tab, setTab]                   = useState('market');
  const [query, setQuery]               = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching]       = useState(false);
  const [searchErr, setSearchErr]       = useState('');
  const searchTimer = useRef(null);

  useEffect(() => { loadMarket(); }, []);

  async function loadMarket() {
    setLoadingMkt(true);
    try {
      const [mkt, wl] = await Promise.all([api.getMarket(), api.getWatchlist()]);
      setStocks(mkt.stocks || []);
      setWatchlist(wl.watchlist || []);
    } catch { /* silent — market will show empty */ }
    finally { setLoadingMkt(false); }
  }

  function onQueryChange(v) {
    setQuery(v); setSearchErr('');
    if (!v.trim()) { setSearchResult(null); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(v.trim().toUpperCase()), 650);
  }

  async function doSearch(sym) {
    setSearching(true); setSearchResult(null);
    try { const d = await api.searchStock(sym); setSearchResult(d.stock); }
    catch { setSearchErr(`No data found for "${sym}"`); }
    finally { setSearching(false); }
  }

  async function runAnalysis() {
    if (loadingAI) return;
    setLoadingAI(true); setErrAI(''); setTab('analysis');
    try {
      const d = await api.analyzeStocks(stocks.slice(0, 5).map(s => s.symbol));
      setAnalysis(d);
    } catch (e) {
      setErrAI(e?.data?.error || 'Analysis failed — try again.');
    } finally { setLoadingAI(false); }
  }

  async function runNews() {
    if (loadingNews) return;
    setLoadingNews(true); setErrNews(''); setTab('events');
    try {
      const d = await api.getStockNews();
      setNews(d);
    } catch (e) {
      setErrNews(e?.data?.error || 'Could not load news — try again.');
    } finally { setLoadingNews(false); }
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
  const bullish = gainers > losers;

  return (
    <div className="screen-card pb-28">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <Label>Markets</Label>
        <div className="flex items-end justify-between">
          <h1 className="text-[26px] font-black tracking-tight leading-none">Stock Market</h1>
          {!loadingMkt && stocks.length > 0 && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${bullish ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`text-xs font-bold ${bullish ? 'text-emerald-400' : 'text-red-400'}`}>
                {bullish ? 'Bullish' : 'Bearish'}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-sm select-none">⌕</span>
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)}
            placeholder="Search any ticker — AAPL, BTC-USD, QQQ…"
            className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors" />
          {searching && (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-xs inline-block select-none">◌</motion.span>
          )}
        </div>
        <AnimatePresence>
          {searchResult && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-1.5 bg-surface-800 border border-surface-700 rounded-xl px-3.5 py-3 flex items-center gap-3">
              <button onClick={() => toggleWatchlist(searchResult.symbol)}
                className={`text-base leading-none flex-shrink-0 transition-colors ${watchlist.includes(searchResult.symbol) ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>★</button>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm tracking-tight">{searchResult.symbol}</p>
                <p className="text-[10px] text-surface-500 truncate">{searchResult.name}</p>
              </div>
              <Sparkline data={searchResult.sparkline} positive={searchResult.changePct >= 0} />
              <div className="text-right flex-shrink-0">
                <p className="font-black text-sm tabular-nums">${searchResult.price?.toFixed(2)}</p>
                <div className="flex justify-end"><Pct value={searchResult.changePct} /></div>
              </div>
            </motion.div>
          )}
          {searchErr && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-1 text-xs text-red-400 pl-1">{searchErr}</motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Market summary bar ────────────────────────────────────────── */}
      {!loadingMkt && stocks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3.5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Today's Pulse</Label>
              <p className="font-bold text-sm text-white">
                {bullish ? 'Mostly climbing 📈' : gainers === losers ? 'Mixed signals ↔️' : 'Mostly falling 📉'}
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-emerald-400 font-black text-xl tabular-nums leading-none">{gainers}</p>
                <p className="text-[9px] font-bold tracking-widest text-surface-500 uppercase mt-0.5">UP</p>
              </div>
              <div className="w-px h-7 bg-surface-700" />
              <div className="text-center">
                <p className="text-red-400 font-black text-xl tabular-nums leading-none">{losers}</p>
                <p className="text-[9px] font-bold tracking-widest text-surface-500 uppercase mt-0.5">DOWN</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-surface-800 border border-surface-700 rounded-xl mb-5">
        {[
          { id: 'market',   label: 'Market',     action: () => setTab('market') },
          { id: 'analysis', label: '🤖 Analysis', action: runAnalysis },
          { id: 'events',   label: '📰 Events',   action: runNews },
        ].map(t => (
          <button key={t.id} onClick={t.action}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === t.id ? 'bg-surface-700 text-white' : 'text-surface-500 hover:text-surface-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* MARKET */}
        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Filter row */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {[['all','All'],['watchlist','⭐ Watchlist'],['gainers','▲ Gainers'],['losers','▼ Losers']].map(([f, lbl]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    filter === f ? 'bg-brand-500 text-white' : 'bg-surface-800 border border-surface-700 text-surface-500 hover:text-white'
                  }`}>{lbl}</button>
              ))}
            </div>

            {loadingMkt ? (
              <div className="flex flex-col gap-1.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-[58px] rounded-xl bg-surface-800 border border-surface-700 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((stock, i) => {
                  const pos = stock.changePct >= 0;
                  const inWL = watchlist.includes(stock.symbol);
                  return (
                    <motion.div key={stock.symbol}
                      initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.018 }}
                      className="bg-surface-800 border border-surface-700 rounded-xl flex items-center gap-3 px-3.5 py-3 hover:border-surface-600 transition-colors">
                      <button onClick={() => toggleWatchlist(stock.symbol)}
                        className={`text-sm leading-none flex-shrink-0 transition-colors ${inWL ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>★</button>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm tracking-tight">{stock.symbol}</p>
                        <p className="text-[10px] text-surface-500 truncate leading-tight">{stock.name}</p>
                      </div>
                      <Sparkline data={stock.sparkline} positive={pos} />
                      <div className="text-right flex-shrink-0 w-20">
                        <p className="font-black text-sm tabular-nums">${stock.price?.toFixed(2)}</p>
                        <div className="flex justify-end"><Pct value={stock.changePct} /></div>
                      </div>
                    </motion.div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-3xl mb-2">{filter === 'watchlist' ? '⭐' : '🔍'}</p>
                    <p className="text-sm text-surface-500">
                      {filter === 'watchlist' ? 'No watchlist yet — tap ★ on any stock' : 'No stocks match this filter'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* AI ANALYSIS */}
        {tab === 'analysis' && (
          <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingAI ? (
              <Loader label="Reading the charts…" sub="Candlesticks · RSI · Moving averages · Volume — ~20s" />
            ) : errAI ? (
              <ErrorState message={errAI} onRetry={runAnalysis} />
            ) : analysis ? (
              <div className="flex flex-col gap-3">

                {/* Market mood */}
                <div className="bg-surface-800 border border-surface-700 rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-3xl flex-shrink-0">
                    {analysis.marketMood === 'bullish' ? '🐂' : analysis.marketMood === 'bearish' ? '🐻' : '🦘'}
                  </span>
                  <div>
                    <Label>Market Mood</Label>
                    <p className="font-black text-sm capitalize text-white">{analysis.marketMood}</p>
                    <p className="text-xs text-surface-400 leading-snug mt-0.5">{analysis.marketSummary}</p>
                  </div>
                </div>

                {/* Pattern of the day */}
                {analysis.patternOfTheDay && (
                  <div className="bg-surface-800 border border-purple-500/25 rounded-2xl p-4">
                    <Label>🕯 Pattern of the Day</Label>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-sm text-white">{analysis.patternOfTheDay.name}</p>
                      <Tag color="purple">{analysis.patternOfTheDay.stock}</Tag>
                    </div>
                    <p className="text-xs text-surface-400 leading-relaxed">{analysis.patternOfTheDay.explanation}</p>
                  </div>
                )}

                <Divider />
                <Label>Top Picks</Label>
                {analysis.topPicks?.map((p, i) => <PickCard key={p.symbol} pick={p} index={i} />)}

                {analysis.beginnerTip && (
                  <>
                    <Divider />
                    <div className="bg-surface-800 border border-brand-500/20 rounded-2xl p-4">
                      <Label>💡 Chart Tip</Label>
                      <p className="text-sm text-surface-300">{analysis.beginnerTip}</p>
                    </div>
                  </>
                )}

                <p className="text-[10px] text-surface-600 text-center leading-relaxed px-2 mt-1">
                  {analysis.stocksAnalyzed && `Analyzed: ${analysis.stocksAnalyzed.join(' · ')}`}
                </p>
                <p className="text-[10px] text-surface-600 text-center leading-relaxed px-2">
                  ⚠️ AI-generated educational content only. Not financial advice.
                </p>

                <button onClick={runAnalysis}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all mt-1">
                  🔄 Re-analyze
                </button>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* EVENTS */}
        {tab === 'events' && (
          <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingNews ? (
              <Loader label="Scanning the news…" sub="Pulling headlines · AI market analysis — ~15s" />
            ) : errNews ? (
              <ErrorState message={errNews} onRetry={runNews} />
            ) : news ? (
              <div className="flex flex-col gap-3">

                {/* Pulse card */}
                <div className={`bg-surface-800 border rounded-2xl p-4 ${
                  news.fearGreed === 'greed' ? 'border-emerald-500/25' :
                  news.fearGreed === 'fear'  ? 'border-red-500/25' : 'border-surface-700'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>Market Pulse — {new Date(news.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Label>
                    <Tag color={news.fearGreed === 'greed' ? 'bullish' : news.fearGreed === 'fear' ? 'bearish' : 'neutral'}>
                      {news.fearGreed === 'greed' ? '😤 Greed' : news.fearGreed === 'fear' ? '😨 Fear' : '😐 Neutral'}
                    </Tag>
                  </div>
                  <p className="text-sm font-bold text-white leading-snug">{news.marketPulse}</p>
                  {news.hotSector && (
                    <p className="text-xs text-surface-500 mt-1.5">
                      Hot sector: <span className="text-white font-semibold">{news.hotSector}</span>
                    </p>
                  )}
                </div>

                <Divider />
                <Label>Current Events · {news.count || news.events?.length} stories</Label>
                {news.events?.map((e, i) => <EventCard key={i} event={e} index={i} />)}

                <button onClick={runNews}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all mt-1">
                  🔄 Refresh
                </button>
                <p className="text-[10px] text-surface-600 text-center px-4 leading-relaxed">
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
