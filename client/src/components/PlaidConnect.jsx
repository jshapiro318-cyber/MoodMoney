import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlaidLink } from 'react-plaid-link';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

// ─── Bank directory ───────────────────────────────────────────────────────────
const BANKS = [
  { id: 'chase',    name: 'Chase',             color: '#0F6FBF', bg: '#0F6FBF18' },
  { id: 'bofa',     name: 'Bank of America',   color: '#E31837', bg: '#E3183718' },
  { id: 'wells',    name: 'Wells Fargo',        color: '#D71E28', bg: '#D71E2818' },
  { id: 'citi',     name: 'Citibank',           color: '#003B95', bg: '#003B9518' },
  { id: 'amex',     name: 'American Express',  color: '#016FD0', bg: '#016FD018' },
  { id: 'capital',  name: 'Capital One',        color: '#D03027', bg: '#D0302718' },
  { id: 'discover', name: 'Discover',           color: '#FF6600', bg: '#FF660018' },
  { id: 'usbank',   name: 'U.S. Bank',          color: '#003087', bg: '#00308718' },
  { id: 'td',       name: 'TD Bank',            color: '#34B233', bg: '#34B23318' },
  { id: 'pnc',      name: 'PNC Bank',           color: '#F58025', bg: '#F5802518' },
  { id: 'truist',   name: 'Truist',             color: '#5B2B82', bg: '#5B2B8218' },
  { id: 'ally',     name: 'Ally Bank',          color: '#7D4197', bg: '#7D419718' },
  { id: 'marcus',   name: 'Goldman Sachs',      color: '#A08840', bg: '#A0884018' },
  { id: 'sofi',     name: 'SoFi',               color: '#8A05BE', bg: '#8A05BE18' },
  { id: 'chime',    name: 'Chime',              color: '#01C37D', bg: '#01C37D18' },
  { id: 'cashapp',  name: 'Cash App',           color: '#00D632', bg: '#00D63218' },
  { id: 'fidelity', name: 'Fidelity',           color: '#016A35', bg: '#016A3518' },
  { id: 'schwab',   name: 'Charles Schwab',     color: '#01A0E4', bg: '#01A0E418' },
  { id: 'paypal',   name: 'PayPal',             color: '#003087', bg: '#00308718' },
  { id: 'navy',     name: 'Navy Federal CU',    color: '#003057', bg: '#00305718' },
  { id: 'usaa',     name: 'USAA',               color: '#003087', bg: '#00308718' },
  { id: 'regions',  name: 'Regions Bank',       color: '#006747', bg: '#00674718' },
];

// ─── Tiny bank logo ───────────────────────────────────────────────────────────
function BankLogo({ bank, size = 'md' }) {
  const dims = { sm: 36, md: 48, lg: 64 }[size] || 48;
  const radius = { sm: 10, md: 14, lg: 18 }[size] || 14;
  const fontSize = { sm: 12, md: 15, lg: 20 }[size] || 15;
  const initial = bank.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center justify-center flex-shrink-0 font-black"
      style={{
        width: dims, height: dims, borderRadius: radius,
        background: bank.bg || `${bank.color}18`,
        border: `1.5px solid ${bank.color}40`,
        color: bank.color,
        fontSize,
      }}>
      {initial}
    </div>
  );
}

// ─── Step 1: Bank picker sheet ────────────────────────────────────────────────
function BankPicker({ onSelect, onCancel }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120); }, []);
  const filtered = query.trim()
    ? BANKS.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : BANKS;

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl flex flex-col"
      style={{ maxHeight: '90vh', background: '#0f0f14', borderTop: '1px solid rgba(255,255,255,0.1)' }}>

      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: '#2a2a38' }} />
      </div>

      <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-white">Select your bank</h2>
          <p className="text-xs mt-0.5" style={{ color: '#606078' }}>{BANKS.length} institutions supported</p>
        </div>
        <button onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Icon name="x" size={14} style={{ color: '#606078' }} />
        </button>
      </div>

      <div className="px-5 pb-3 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon name="magnifying-glass" size={13} style={{ color: '#606078' }} />
          </span>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search Chase, Amex, SoFi…"
            className="w-full rounded-2xl pl-9 pr-4 py-3 text-sm"
            style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f0f8', outline: 'none' }} />
        </div>
      </div>

      <div className="overflow-y-auto flex-1 px-5 pb-6">
        <div className="flex flex-col gap-1.5">
          {filtered.map((bank, i) => (
            <motion.button key={bank.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.012, 0.18) }}
              onClick={() => onSelect(bank)}
              className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left w-full transition-all active:scale-[0.98]"
              style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.07)' }}>
              <BankLogo bank={bank} size="sm" />
              <p className="font-bold text-sm text-white flex-1">{bank.name}</p>
              <Icon name="chevron-right" size={13} style={{ color: '#50505e' }} />
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Connecting progress screen ───────────────────────────────────────────────
// cur is controlled by the parent via useRef timers — no stale closure risk
function ConnectingScreen({ bank, cur }) {
  const steps = [
    `Reaching ${bank.name}…`,
    'Verifying your identity…',
    'Reading account details…',
    'Importing transactions…',
    'All done!',
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-3xl p-7 shadow-2xl"
      style={{ background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="flex flex-col items-center gap-5 text-center">
        <BankLogo bank={bank} size="lg" />
        <div>
          <p className="text-lg font-black text-white">{bank.name}</p>
          <p className="text-xs mt-0.5" style={{ color: '#606078' }}>Securely importing your transactions…</p>
        </div>
        <div className="w-full flex flex-col gap-2.5 text-left">
          {steps.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: i <= cur ? 1 : 0.2 }}
              className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 transition-all"
                style={{
                  background: i < cur ? '#22c55e' : i === cur ? '#f97316' : '#1a1a26',
                  color: i <= cur ? '#fff' : '#606078',
                }}>
                {i < cur ? '✓' : i === cur
                  ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">◌</motion.span>
                  : '·'}
              </div>
              <span className="text-xs" style={{ fontWeight: i <= cur ? 700 : 400, color: i <= cur ? '#fff' : '#50505e' }}>{s}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Plaid Link wrapper (real credentials) ────────────────────────────────────
function RealPlaidAuth({ linkToken, bank, onSuccess, onExit }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
    onExit: () => onExit(),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="flex flex-col items-center gap-4">
        <BankLogo bank={bank} size="lg" />
        <div className="text-center">
          <p className="text-base font-black text-white">Opening {bank.name}…</p>
          <p className="text-xs mt-1" style={{ color: '#606078' }}>Secure connection via Plaid</p>
        </div>
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
        <button onClick={onExit} className="text-xs mt-2" style={{ color: '#50505e' }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlaidConnect({ onSuccess, bankConnected, institutionName }) {
  // step: idle | pick | checking | plaid-auth | connecting | done | error
  const [step,        setStep]        = useState('idle');
  const [selectedBank, setSelectedBank] = useState(null);
  const [linkToken,   setLinkToken]   = useState(null);
  const [isDemo,      setIsDemo]      = useState(false);
  const [error,       setError]       = useState('');
  const [connectCur,  setConnectCur]  = useState(0);   // which step is active in ConnectingScreen
  const timersRef = useRef([]);

  // ── After user picks a bank, fetch link token to determine real vs demo ──
  async function handleBankSelect(bank) {
    setSelectedBank(bank);
    setStep('checking');
    setError('');
    try {
      const { link_token, demo } = await api.getLinkToken();
      if (demo) {
        setIsDemo(true);
        runMockConnect(bank);
      } else {
        // Real credentials — open Plaid Link
        setLinkToken(link_token);
        setStep('plaid-auth');
      }
    } catch (err) {
      setError('Could not initialize connection. Please try again.');
      setStep('idle');
    }
  }

  // ── Shared: run the connecting animation then call onSuccess ─────────────
  function startConnectingFlow(apiFn) {
    // Clear any old timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setConnectCur(0);
    setStep('connecting');

    // Fire the real API work in background — don't block on it
    apiFn().catch(err => console.error('[plaid api]', err));

    // Advance each step every 700ms
    const STEP_COUNT = 5;
    for (let i = 0; i < STEP_COUNT; i++) {
      timersRef.current.push(
        setTimeout(() => setConnectCur(i + 1), (i + 1) * 700)
      );
    }
    // Dismiss 600ms after the last step turns green
    timersRef.current.push(
      setTimeout(() => {
        setStep('idle');
        setConnectCur(0);
        onSuccess?.();
      }, STEP_COUNT * 700 + 600)
    );
  }

  // ── Demo mode: seed mock transactions ────────────────────────────────────
  function runMockConnect(bank) {
    startConnectingFlow(() => api.connectBank(bank.name));
  }

  // ── Real Plaid: exchange public_token for real transactions ───────────────
  function handlePlaidSuccess(public_token, metadata) {
    startConnectingFlow(() =>
      api.exchangeToken(public_token, metadata.institution || { name: selectedBank?.name })
    );
  }

  // ── Already connected ─────────────────────────────────────────────────────
  if (bankConnected) {
    const matchedBank = BANKS.find(b => b.name === institutionName);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
        style={{ background: '#111118', border: '1px solid rgba(52,211,153,0.2)' }}>
        {matchedBank
          ? <BankLogo bank={matchedBank} size="sm" />
          : <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <Icon name="building-library" size={16} className="text-emerald-400" />
            </div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white truncate">
            {institutionName || 'Bank'} Connected
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#606078' }}>
            Transactions syncing · read-only
          </p>
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
        className="rounded-2xl px-4 py-5"
        style={{ background: '#111118', border: '1px solid rgba(249,115,22,0.2)', borderStyle: 'dashed' }}>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <Icon name="building-library" size={18} className="text-orange-400" />
          </div>
          <div>
            <p className="font-black text-sm text-white">Connect Your Bank</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#606078' }}>
              Sync real transactions for accurate insights
            </p>
          </div>
        </div>

        {/* Bank logo strip */}
        <div className="flex items-center gap-1.5 mb-4 overflow-hidden">
          {BANKS.slice(0, 7).map(b => (
            <div key={b.id} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[9px] font-black"
              style={{ background: b.bg || `${b.color}18`, border: `1px solid ${b.color}30`, color: b.color }}>
              {b.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
          ))}
          <span className="text-[10px] ml-1 flex-shrink-0" style={{ color: '#50505e' }}>
            +{BANKS.length - 7} more
          </span>
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-xl"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
            {error}
          </p>
        )}

        <button onClick={() => { setStep('pick'); setError(''); }}
          className="btn-primary">
          Choose your bank →
        </button>

        <p className="text-[10px] text-center mt-3 leading-relaxed" style={{ color: '#50505e' }}>
          256-bit encryption · read-only access · powered by Plaid
        </p>
      </motion.div>

      {/* Backdrop */}
      <AnimatePresence>
        {step === 'pick' && (
          <motion.div key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setStep('idle')} />
        )}
      </AnimatePresence>

      {/* Connecting backdrop */}
      <AnimatePresence>
        {(step === 'connecting' || step === 'checking') && (
          <motion.div key="cbd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} />
        )}
      </AnimatePresence>

      {/* Panels */}
      <AnimatePresence mode="wait">
        {step === 'pick' && (
          <BankPicker key="pick"
            onSelect={handleBankSelect}
            onCancel={() => setStep('idle')} />
        )}

        {step === 'checking' && selectedBank && (
          <motion.div key="checking"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-3xl p-7 text-center"
            style={{ background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)' }}>
            <BankLogo bank={selectedBank} size="lg" />
            <p className="text-base font-black text-white mt-4">Connecting to {selectedBank.name}…</p>
            <div className="w-7 h-7 border-2 rounded-full animate-spin mx-auto mt-4"
              style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
          </motion.div>
        )}

        {step === 'plaid-auth' && linkToken && selectedBank && (
          <RealPlaidAuth key="plaid-auth"
            linkToken={linkToken}
            bank={selectedBank}
            onSuccess={handlePlaidSuccess}
            onExit={() => setStep('idle')} />
        )}

        {step === 'connecting' && selectedBank && (
          <ConnectingScreen key="connecting" bank={selectedBank} cur={connectCur} />
        )}
      </AnimatePresence>
    </>
  );
}
