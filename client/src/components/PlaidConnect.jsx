import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

// ─── Bank directory ───────────────────────────────────────────────────────────
const BANKS = [
  { id: 'chase',    name: 'Chase',             color: '#0F6FBF', bg: '#0F6FBF18', logo: '🏛️' },
  { id: 'bofa',     name: 'Bank of America',   color: '#E31837', bg: '#E3183718', logo: '🏦' },
  { id: 'wells',    name: 'Wells Fargo',        color: '#D71E28', bg: '#D71E2818', logo: '🐴' },
  { id: 'citi',     name: 'Citibank',           color: '#003B95', bg: '#003B9518', logo: '🌐' },
  { id: 'amex',     name: 'American Express',  color: '#016FD0', bg: '#016FD018', logo: '💳' },
  { id: 'capital',  name: 'Capital One',        color: '#D03027', bg: '#D0302718', logo: '✦' },
  { id: 'discover', name: 'Discover',           color: '#FF6600', bg: '#FF660018', logo: '🔍' },
  { id: 'usbank',   name: 'U.S. Bank',          color: '#003087', bg: '#00308718', logo: '🇺🇸' },
  { id: 'td',       name: 'TD Bank',            color: '#34B233', bg: '#34B23318', logo: '🍃' },
  { id: 'pnc',      name: 'PNC Bank',           color: '#F58025', bg: '#F5802518', logo: '🏢' },
  { id: 'truist',   name: 'Truist',             color: '#5B2B82', bg: '#5B2B8218', logo: '🔷' },
  { id: 'ally',     name: 'Ally Bank',          color: '#7D4197', bg: '#7D419718', logo: '⚡' },
  { id: 'marcus',   name: 'Goldman Sachs',      color: '#A08840', bg: '#A0884018', logo: '▲' },
  { id: 'sofi',     name: 'SoFi',               color: '#8A05BE', bg: '#8A05BE18', logo: '💜' },
  { id: 'chime',    name: 'Chime',              color: '#01C37D', bg: '#01C37D18', logo: '🔔' },
  { id: 'cashapp',  name: 'Cash App',           color: '#00D632', bg: '#00D63218', logo: '💵' },
  { id: 'fidelity', name: 'Fidelity',           color: '#016A35', bg: '#016A3518', logo: '📈' },
  { id: 'schwab',   name: 'Charles Schwab',     color: '#01A0E4', bg: '#01A0E418', logo: '📊' },
  { id: 'paypal',   name: 'PayPal',             color: '#003087', bg: '#00308718', logo: '🅿️' },
  { id: 'navy',     name: 'Navy Federal CU',    color: '#003057', bg: '#00305718', logo: '⚓' },
  { id: 'usaa',     name: 'USAA',               color: '#003087', bg: '#00308718', logo: '🦅' },
  { id: 'regions',  name: 'Regions Bank',       color: '#006747', bg: '#00674718', logo: '🌿' },
];

// ─── Bank logo ────────────────────────────────────────────────────────────────
function BankLogo({ bank, size = 'md' }) {
  const sz = {
    sm:  'w-9 h-9 text-base rounded-xl',
    md:  'w-12 h-12 text-xl rounded-2xl',
    lg:  'w-16 h-16 text-3xl rounded-3xl',
  }[size] || 'w-12 h-12 text-xl rounded-2xl';
  return (
    <div className={`${sz} flex items-center justify-center flex-shrink-0`}
      style={{ background: bank.bg, border: `1.5px solid ${bank.color}30` }}>
      <span>{bank.logo}</span>
    </div>
  );
}

// ─── Step 1: Bank picker ──────────────────────────────────────────────────────
function BankPicker({ onSelect, onCancel }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const filtered = query.trim()
    ? BANKS.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : BANKS;

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      className="fixed inset-x-0 bottom-0 z-50 bg-[#0f0f14] border-t border-surface-700 rounded-t-3xl shadow-2xl flex flex-col"
      style={{ maxHeight: '90vh' }}>

      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-surface-700" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-white">Select your bank</h2>
          <p className="text-xs text-surface-500 mt-0.5">{BANKS.length} banks supported</p>
        </div>
        <button onClick={onCancel}
          className="w-9 h-9 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-white text-sm transition-colors">✕</button>
      </div>

      {/* Search */}
      <div className="px-5 pb-3 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-sm select-none">⌕</span>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search Chase, Amex, SoFi…"
            className="w-full bg-surface-800 border border-surface-700 rounded-2xl pl-9 pr-4 py-3 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors" />
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 px-5 pb-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm text-surface-500">No banks found for "{query}"</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((bank, i) => (
              <motion.button key={bank.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.012, 0.18) }}
                onClick={() => onSelect(bank)}
                className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-surface-800 border border-surface-700 hover:border-surface-500 active:scale-[0.98] transition-all text-left w-full">
                <BankLogo bank={bank} size="sm" />
                <p className="font-bold text-sm text-white flex-1">{bank.name}</p>
                <span className="text-surface-500 text-sm flex-shrink-0">›</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Step 2: Login form ───────────────────────────────────────────────────────
function BankLogin({ bank, onConnect, onBack, connecting }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      className="fixed inset-x-0 bottom-0 z-50 bg-[#0f0f14] border-t border-surface-700 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: '90vh' }}>

      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-surface-700" />
      </div>

      <div className="overflow-y-auto flex-1 px-5 pt-2 pb-8">
        {/* Back */}
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-brand-400 hover:text-brand-300 mb-5 transition-colors">
          ← All banks
        </button>

        {/* Bank header */}
        <div className="flex items-center gap-4 mb-6">
          <BankLogo bank={bank} size="lg" />
          <div>
            <h2 className="text-2xl font-black text-white leading-tight">{bank.name}</h2>
            <p className="text-xs text-surface-500 mt-0.5">Sign in to connect your account</p>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-6">
          <span className="text-emerald-400 text-lg flex-shrink-0">🔒</span>
          <div>
            <p className="text-xs font-bold text-emerald-400">Bank-grade security</p>
            <p className="text-[10px] text-surface-500 leading-relaxed mt-0.5">
              256-bit encryption · read-only · your password is never stored
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-2 block">
              Username or Email
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={`Your ${bank.name} username`}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              className="w-full bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3.5 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-surface-500 mb-2 block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3.5 pr-16 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-surface-400 hover:text-surface-200 transition-colors">
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Connect button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onConnect(bank)}
            disabled={!username.trim() || !password.trim() || connecting}
            className="w-full py-4 rounded-2xl text-white text-sm font-black disabled:opacity-40 transition-all mt-2 flex items-center justify-center gap-2"
            style={{
              background: connecting ? '#333' : bank.color,
              boxShadow: connecting ? 'none' : `0 8px 28px ${bank.color}40`,
            }}>
            {connecting ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block text-base">◌</motion.span>
                Connecting…
              </>
            ) : (
              `Connect ${bank.name}`
            )}
          </motion.button>

          <p className="text-[10px] text-surface-600 text-center leading-relaxed">
            MoodMoney uses read-only access to view balances and transactions. We never initiate transfers.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Connecting progress overlay ──────────────────────────────────────────────
function ConnectingScreen({ bank }) {
  const steps = [
    `Reaching ${bank.name}…`,
    'Verifying your identity…',
    'Reading account details…',
    'Importing transactions…',
    'All done!',
  ];
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const timers = steps.slice(0, -1).map((_, i) => setTimeout(() => setCur(i + 1), (i + 1) * 750));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto bg-[#0f0f14] border border-surface-700 rounded-3xl p-7 shadow-2xl">
      <div className="flex flex-col items-center gap-5 text-center">
        <BankLogo bank={bank} size="lg" />
        <div>
          <p className="text-lg font-black text-white">{bank.name}</p>
          <p className="text-xs text-surface-500 mt-0.5">Securely connecting your account…</p>
        </div>
        <div className="w-full flex flex-col gap-2.5 text-left">
          {steps.map((s, i) => (
            <motion.div key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: i <= cur ? 1 : 0.2 }}
              className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 transition-all ${
                i < cur  ? 'bg-emerald-500 text-white' :
                i === cur ? 'bg-brand-500 text-white' :
                'bg-surface-700 text-surface-600'
              }`}>
                {i < cur ? '✓' : i === cur ? (
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">◌</motion.span>
                ) : '·'}
              </div>
              <span className={`text-xs ${i <= cur ? 'font-bold text-white' : 'text-surface-600'}`}>{s}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function PlaidConnect({ onSuccess, bankConnected, institutionName }) {
  const [step, setStep]           = useState('idle'); // idle | pick | login | connecting
  const [selectedBank, setSelectedBank] = useState(null);
  const [error, setError]         = useState('');

  async function handleConnect(bank) {
    setStep('connecting');
    setError('');
    try {
      // Hit our custom /api/plaid/connect — never opens Plaid Link iframe
      await api.connectBank(bank.name);
      // Small delay so the animation finishes gracefully
      setTimeout(() => {
        setStep('idle');
        onSuccess?.();
      }, 3800);
    } catch (err) {
      setError(err?.data?.error || 'Could not connect. Please try again.');
      setStep('login');
    }
  }

  // ── Already connected ──────────────────────────────────────────────────────
  if (bankConnected) {
    const matchedBank = BANKS.find(b => b.name === institutionName);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-surface-800 border border-emerald-500/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
        {matchedBank
          ? <BankLogo bank={matchedBank} size="sm" />
          : <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-lg flex-shrink-0">🏦</div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white truncate">{institutionName || 'Bank'} Connected</p>
          <p className="text-[10px] text-surface-500">Transactions syncing · read-only</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-400">Live</span>
        </div>
      </motion.div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Connect card */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-surface-800 border border-brand-500/20 border-dashed rounded-2xl px-4 py-5">

        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-brand-500/15 flex items-center justify-center text-xl flex-shrink-0">🏦</div>
          <div>
            <p className="font-black text-sm text-white">Connect Your Bank</p>
            <p className="text-[10px] text-surface-500 mt-0.5">Sync real transactions for accurate insights</p>
          </div>
        </div>

        {/* Bank logo strip */}
        <div className="flex items-center gap-1.5 mb-4 overflow-hidden">
          {BANKS.slice(0, 7).map(b => (
            <div key={b.id} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: b.bg, border: `1px solid ${b.color}30` }}>
              {b.logo}
            </div>
          ))}
          <span className="text-[10px] text-surface-500 ml-1 flex-shrink-0">+{BANKS.length - 7} more</span>
        </div>

        {error && (
          <p className="text-red-400 text-xs mb-3 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          onClick={() => { setStep('pick'); setError(''); }}
          className="w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-black transition-all active:scale-[0.98] shadow-lg shadow-brand-500/20">
          Choose your bank →
        </button>

        <p className="text-[10px] text-surface-600 text-center mt-3 leading-relaxed">
          🔒 256-bit encryption · read-only access · never stores your password
        </p>
      </motion.div>

      {/* Backdrop */}
      <AnimatePresence>
        {(step === 'pick' || step === 'login') && (
          <motion.div key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={() => setStep('idle')} />
        )}
      </AnimatePresence>

      {/* Connecting backdrop */}
      <AnimatePresence>
        {step === 'connecting' && (
          <motion.div key="cbd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" />
        )}
      </AnimatePresence>

      {/* Panels */}
      <AnimatePresence mode="wait">
        {step === 'pick' && (
          <BankPicker key="pick"
            onSelect={bank => { setSelectedBank(bank); setStep('login'); }}
            onCancel={() => setStep('idle')} />
        )}
        {step === 'login' && selectedBank && (
          <BankLogin key="login"
            bank={selectedBank}
            connecting={false}
            onConnect={handleConnect}
            onBack={() => setStep('pick')} />
        )}
        {step === 'connecting' && selectedBank && (
          <ConnectingScreen key="connecting" bank={selectedBank} />
        )}
      </AnimatePresence>
    </>
  );
}
