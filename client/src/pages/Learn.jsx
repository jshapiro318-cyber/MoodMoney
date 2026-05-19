import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { LESSONS } from '../lib/lessons.js';
import Icon from '../components/Icon.jsx';

// ─── World map (16 worlds) ────────────────────────────────────────────────────
const WORLDS = [
  {
    id: 'basics',
    name: 'Money Basics',
    emoji: '🌱',
    color: '#10b981',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
    text: 'text-green-400',
    gradient: 'from-green-900/40 to-surface-900',
    lessonIds: [
      'budget-101','credit-score-101','compound-interest','emergency-fund','debit-vs-credit',
      'needs-vs-wants','pay-yourself-first','spending-triggers','financial-goals',
      'bank-accounts','saving-habits','fees-and-costs',
    ],
  },
  {
    id: 'credit',
    name: 'Credit & Debt',
    emoji: '💳',
    color: '#ef4444',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-400',
    gradient: 'from-red-900/40 to-surface-900',
    lessonIds: [
      'debt-types','interest-rates-debt','credit-card-debt','student-loans',
      'debt-snowball-avalanche','credit-utilization','credit-report',
      'hard-vs-soft-inquiry','debt-consolidation','collections',
      'building-credit-from-zero','bankruptcy-basics','debt-to-income',
    ],
  },
  {
    id: 'budgeting',
    name: 'Budgeting Mastery',
    emoji: '📋',
    color: '#f59e0b',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    gradient: 'from-yellow-900/40 to-surface-900',
    lessonIds: [
      'zero-based-budgeting','envelope-method','tracking-expenses','variable-vs-fixed',
      'subscription-audit','sinking-funds','anti-budget','irregular-income',
      'food-budget','budget-categories','lifestyle-creep-budget','budgeting-apps',
    ],
  },
  {
    id: 'banking',
    name: 'Banking & Saving',
    emoji: '🏦',
    color: '#06b6d4',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    gradient: 'from-cyan-900/40 to-surface-900',
    lessonIds: [
      'fdic-insurance','hysa','cds','overdraft','money-market',
      'automatic-savings','direct-deposit','mobile-banking-security',
      'banking-alternatives','savings-rate','wire-transfers','checking-account-fees',
    ],
  },
  {
    id: 'investing',
    name: 'Investing Fundamentals',
    emoji: '📈',
    color: '#f97316',
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    gradient: 'from-orange-900/40 to-surface-900',
    lessonIds: [
      'stocks-basics','bonds-basics','index-funds','etfs-explained','brokerage-accounts',
      'asset-allocation','dollar-cost-averaging','rebalancing','risk-tolerance',
      'market-cycles','portfolio-diversification','reinvesting-dividends',
      'investment-accounts-order',
    ],
  },
  {
    id: 'psychology',
    name: 'Money Psychology',
    emoji: '🧠',
    color: '#8b5cf6',
    bg: 'bg-violet-500/15',
    border: 'border-violet-500/30',
    text: 'text-violet-400',
    gradient: 'from-violet-900/40 to-surface-900',
    lessonIds: [
      'anchoring-bias','behavioral-finance','hedonic-adaptation','fear-and-greed',
      'present-bias','mental-accounting','social-comparison','loss-aversion-deep',
      'framing-effect','availability-heuristic','sunk-cost-investing','overconfidence-bias',
    ],
  },
  {
    id: 'realestate',
    name: 'Real Estate',
    emoji: '🏠',
    color: '#84cc16',
    bg: 'bg-lime-500/15',
    border: 'border-lime-500/30',
    text: 'text-lime-400',
    gradient: 'from-lime-900/40 to-surface-900',
    lessonIds: [
      'rent-vs-buy','mortgage-basics','down-payment','pmi','closing-costs',
      'property-taxes','reits','home-equity','refinancing',
      'real-estate-investing','landlord-basics','homeowners-insurance',
    ],
  },
  {
    id: 'stocks',
    name: 'Stock Market',
    emoji: '📊',
    color: '#ec4899',
    bg: 'bg-pink-500/15',
    border: 'border-pink-500/30',
    text: 'text-pink-400',
    gradient: 'from-pink-900/40 to-surface-900',
    lessonIds: [
      'how-stocks-work','market-cap','pe-ratio','dividends-deep','growth-vs-value',
      'technical-analysis-basics','fundamental-analysis','short-selling',
      'ipo-basics','earnings-reports','stock-splits','market-indices',
    ],
  },
  {
    id: 'economics',
    name: 'Economics',
    emoji: '🌍',
    color: '#14b8a6',
    bg: 'bg-teal-500/15',
    border: 'border-teal-500/30',
    text: 'text-teal-400',
    gradient: 'from-teal-900/40 to-surface-900',
    lessonIds: [
      'supply-and-demand','gdp','inflation','interest-rates-fed',
      'recession-vs-depression','fiscal-policy','monetary-policy',
      'trade-and-tariffs','economic-cycles','consumer-confidence',
      'housing-market-economics','unemployment',
      'economic-indicators','currency-and-forex','wealth-inequality',
    ],
  },
  {
    id: 'career',
    name: 'Career & Income',
    emoji: '💼',
    color: '#6366f1',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    gradient: 'from-indigo-900/40 to-surface-900',
    lessonIds: [
      'salary-negotiation','employee-benefits','401k-basics','side-hustle',
      'freelancing-taxes','equity-compensation','health-insurance-basics',
      'passive-income','income-streams','raises-and-promotions',
      'career-capital','networking','tax-brackets','w2-vs-1099',
    ],
  },
  {
    id: 'insurance',
    name: 'Insurance & Protection',
    emoji: '🛡️',
    color: '#64748b',
    bg: 'bg-slate-500/15',
    border: 'border-slate-500/30',
    text: 'text-slate-400',
    gradient: 'from-slate-900/40 to-surface-900',
    lessonIds: [
      'life-insurance','term-vs-whole-life','disability-insurance','auto-insurance',
      'renters-insurance','deductibles-premiums','umbrella-policy',
      'estate-planning-basics','hsa-fsa','long-term-care',
      'insurance-scams','identity-theft-protection',
    ],
  },
  {
    id: 'fintech',
    name: 'FinTech & Digital Money',
    emoji: '📱',
    color: '#0ea5e9',
    bg: 'bg-sky-500/15',
    border: 'border-sky-500/30',
    text: 'text-sky-400',
    gradient: 'from-sky-900/40 to-surface-900',
    lessonIds: [
      'crypto-basics','blockchain-basics','defi-basics','digital-wallets',
      'buy-now-pay-later','robo-advisors','payment-apps','open-banking',
      'crypto-risks','digital-security','nfts-explained','cbdc',
    ],
  },
  {
    id: 'retirement',
    name: 'Retirement Planning',
    emoji: '🎯',
    color: '#f97316',
    bg: 'bg-brand-500/15',
    border: 'border-brand-500/30',
    text: 'text-brand-400',
    gradient: 'from-orange-900/40 to-surface-900',
    lessonIds: [
      'roth-ira','retirement-timeline','social-security','ira-types',
      'required-minimum-distributions','early-retirement','roth-conversion',
      'retirement-withdrawal-strategies','pension-basics','catch-up-contributions',
      'retirement-income-planning','healthcare-retirement',
    ],
  },
  {
    id: 'advanced-investing',
    name: 'Advanced Investing',
    emoji: '💹',
    color: '#a855f7',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    gradient: 'from-purple-900/40 to-surface-900',
    lessonIds: [
      'tax-loss-harvesting','options-basics','portfolio-diversification-adv',
      'leverage-and-margin','factor-investing','alternative-investments',
      'derivatives-intro','smart-beta','hedge-funds-basics','portfolio-management',
      'international-investing','private-equity-basics',
    ],
  },
  {
    id: 'business',
    name: 'Business Finance',
    emoji: '🏢',
    color: '#22c55e',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
    text: 'text-green-400',
    gradient: 'from-emerald-900/40 to-surface-900',
    lessonIds: [
      'business-structures','revenue-vs-profit','cash-flow','business-taxes',
      'pricing-strategy','break-even','startup-funding','small-biz-accounting',
      'business-credit','business-banking','contracts-basics','exit-strategy',
    ],
  },
  {
    id: 'wealth',
    name: 'Wealth Building',
    emoji: '🌐',
    color: '#eab308',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    gradient: 'from-yellow-900/40 to-surface-900',
    lessonIds: [
      'net-worth','asset-vs-liability','tax-planning','financial-independence',
      'generational-wealth','wealth-mindset','estate-planning-adv',
      'charitable-giving','trusts','wealth-protection','legacy-planning',
      'fire-movement','money-and-happiness',
    ],
  },
];

const LESSON_MAP = Object.fromEntries(LESSONS.map(l => [l.id, l]));

function getStars(score) {
  if (score == null) return 0;
  if (score >= 75) return 3;
  if (score >= 50) return 2;
  return 1;
}

function Stars({ count, color }) {
  return (
    <div className="flex gap-0.5 justify-center">
      {[1, 2, 3].map(i => (
        <span key={i} className="text-sm" style={{ color: i <= count ? color : '#3f3f46' }}>★</span>
      ))}
    </div>
  );
}

// ─── Quiz components ──────────────────────────────────────────────────────────
function QuizQuestion({ question, index, total, onAnswer }) {
  const [selected, setSelected] = useState(null);

  function choose(i) {
    if (selected !== null) return;
    setSelected(i);
    setTimeout(() => onAnswer(i === question.correct), 900);
  }

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-surface-500">Question {index + 1} of {total}</p>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={`w-6 h-1 rounded-full transition-colors ${i < index ? 'bg-brand-500' : i === index ? 'bg-brand-500/50' : 'bg-surface-600'}`} />
          ))}
        </div>
      </div>

      <h3 className="text-lg font-bold leading-snug">{question.q}</h3>

      <div className="flex flex-col gap-2.5">
        {question.options.map((opt, i) => {
          let cls = 'glass-card text-left font-medium transition-all ';
          if (selected === null) cls += 'active:border-brand-500';
          else if (i === question.correct) cls += 'border-green-500 bg-green-500/10';
          else if (i === selected && selected !== question.correct) cls += 'border-red-500 bg-red-500/10';
          else cls += 'opacity-40';

          return (
            <motion.button key={i} onClick={() => choose(i)} disabled={selected !== null}
              className={cls} whileTap={selected === null ? { scale: 0.97 } : {}}>
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${selected === null ? 'bg-surface-600' :
                    i === question.correct ? 'bg-green-500 text-white' :
                    i === selected ? 'bg-red-500 text-white' : 'bg-surface-700'}`}>
                  {selected !== null && i === question.correct ? '✓' :
                   selected === i && i !== question.correct ? '✗' :
                   String.fromCharCode(65 + i)}
                </span>
                {opt}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function LessonView({ lesson, world, onComplete, onClose }) {
  const [phase, setPhase]           = useState('read');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correct, setCorrect]       = useState(0);
  const [score, setScore]           = useState(0);

  function handleAnswer(isCorrect) {
    const newCorrect = correct + (isCorrect ? 1 : 0);
    setCorrect(newCorrect);
    if (questionIndex < lesson.questions.length - 1) {
      setQuestionIndex(i => i + 1);
    } else {
      const finalScore = Math.round((newCorrect / lesson.questions.length) * 100);
      setScore(finalScore);
      setPhase('result');
      onComplete(lesson.id, finalScore, finalScore >= 75 ? lesson.xp : Math.round(lesson.xp * 0.5));
    }
  }

  const stars = getStars(score);

  return (
    <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }} transition={{ type: 'spring', damping: 30 }}
      className="fixed inset-0 bg-surface-900 z-50 overflow-y-auto">
      <div className="max-w-md mx-auto p-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <button onClick={onClose} className="text-surface-500 text-sm">← Back</button>
          <div className={`pill text-xs ${world.bg} ${world.text}`}>
            {world.emoji} {world.name}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* Read phase */}
          {phase === 'read' && (
            <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6">
                <span className="text-6xl block mb-3">{lesson.emoji}</span>
                <h1 className="text-2xl font-bold mb-1">{lesson.title}</h1>
                <p className="text-surface-500 text-sm">{lesson.description}</p>
              </div>
              <div className="glass-card mb-4">
                <p className="text-base leading-relaxed text-surface-200">{lesson.content}</p>
              </div>
              <div className={`glass-card mb-6 ${world.bg} border ${world.border}`}>
                <p className={`text-xs ${world.text} font-bold mb-1 uppercase tracking-wide`}>Quiz time</p>
                <p className="text-sm text-surface-300">{lesson.questions.length} questions · 75%+ for full {lesson.xp} XP</p>
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setPhase('quiz')}
                className="btn-primary w-full">
                Start Quiz →
              </motion.button>
            </motion.div>
          )}

          {/* Quiz phase */}
          {phase === 'quiz' && (
            <motion.div key={`q-${questionIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <QuizQuestion
                question={lesson.questions[questionIndex]}
                index={questionIndex}
                total={lesson.questions.length}
                onAnswer={handleAnswer}
              />
            </motion.div>
          )}

          {/* Result phase */}
          {phase === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center gap-4 pt-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.6, delay: 0.2 }} className="text-7xl">
                {score >= 75 ? '🎉' : score >= 50 ? '😐' : '💪'}
              </motion.div>

              <div>
                <h2 className="text-4xl font-black mb-1">{score}%</h2>
                <p className="text-surface-400">{correct} / {lesson.questions.length} correct</p>
              </div>

              {/* Stars */}
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5, delay: 0.4 }} className="flex gap-2">
                {[1,2,3].map(i => (
                  <motion.span key={i} className="text-4xl"
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.5 + i * 0.12 }}
                    style={{ color: i <= stars ? world.color : '#3f3f46' }}>★</motion.span>
                ))}
              </motion.div>

              <div className={`w-full rounded-2xl p-4 ${score >= 75 ? `${world.bg} border ${world.border}` : 'bg-surface-700/50'}`}>
                {score >= 75 ? (
                  <>
                    <p className={`font-bold ${world.text} mb-1`}>Lesson Complete!</p>
                    <p className="text-sm text-surface-300">You earned +{lesson.xp} XP</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold mb-1">Almost there!</p>
                    <p className="text-sm text-surface-400">+{Math.round(lesson.xp * 0.5)} XP · Try again for full stars</p>
                  </>
                )}
              </div>

              <button onClick={onClose} className="btn-primary w-full mt-2">← Back to path</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Path node ────────────────────────────────────────────────────────────────
function LessonNode({ lesson, world, progress, locked, index, onOpen }) {
  const p     = progress[lesson.id];
  const stars = p ? getStars(p.score) : 0;
  const done  = stars > 0;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06 }}
      className="flex flex-col items-center">

      {/* Node button */}
      <motion.button
        onClick={() => !locked && onOpen(lesson)}
        whileTap={!locked ? { scale: 0.92 } : {}}
        className={`relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center transition-all shadow-lg
          ${locked
            ? 'bg-surface-800 border-2 border-surface-700 opacity-50 cursor-not-allowed'
            : done
              ? `border-2 border-[${world.color}]`
              : 'border-2 border-surface-600 bg-surface-800'
          }`}
        style={done && !locked ? { borderColor: world.color, backgroundColor: `${world.color}22` } : {}}>

        {/* Lock overlay */}
        {locked && (
          <Icon name="lock" size={22} className="opacity-50 text-surface-500" />
        )}

        {!locked && (
          <>
            <span className="text-3xl mb-0.5">{lesson.emoji}</span>
            {done && <Stars count={stars} color={world.color} />}
            {!done && <span className="text-[10px] text-surface-500 mt-0.5">+{lesson.xp} XP</span>}
          </>
        )}

        {/* Pulse ring for next unlocked */}
        {!locked && !done && (
          <motion.div className="absolute inset-0 rounded-2xl"
            animate={{ boxShadow: [`0 0 0 0px ${world.color}40`, `0 0 0 6px ${world.color}00`] }}
            transition={{ duration: 1.5, repeat: Infinity }} />
        )}
      </motion.button>

      {/* Label */}
      <p className={`text-[11px] font-medium mt-1.5 text-center leading-tight w-20
        ${locked ? 'text-surface-600' : done ? 'text-white' : 'text-surface-400'}`}>
        {lesson.title}
      </p>
    </motion.div>
  );
}

// ─── Connector line ───────────────────────────────────────────────────────────
function Connector({ color, done }) {
  return (
    <div className="flex flex-col items-center py-1">
      {[0,1,2].map(i => (
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="w-1 h-2 rounded-full my-0.5 transition-colors"
          style={{ backgroundColor: done ? color : '#3f3f46' }} />
      ))}
    </div>
  );
}

// ─── World banner ─────────────────────────────────────────────────────────────
function WorldBanner({ world, completedCount, totalCount, locked }) {
  const allDone = completedCount === totalCount;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 mb-4 bg-gradient-to-br ${world.gradient} border ${world.border} ${locked ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{world.emoji}</span>
          <div>
            <p className="font-black text-base">{world.name}</p>
            <p className={`text-xs ${world.text}`}>
              {locked ? '🔒 Complete previous world' : `${completedCount} / ${totalCount} lessons`}
            </p>
          </div>
        </div>
        {allDone && !locked && (
          <span className="text-2xl">🏆</span>
        )}
        {!allDone && !locked && (
          <div className="text-right">
            <div className="w-12 h-12">
              <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-full h-full">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#26262c" strokeWidth="3.5" />
                <motion.circle cx="18" cy="18" r="15.9" fill="none" stroke={world.color} strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray: `${(completedCount / totalCount) * 100} 100` }}
                  transition={{ duration: 1, delay: 0.3 }} />
              </svg>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Learn() {
  const [progress, setProgress]       = useState({});
  const [activeLesson, setActiveLesson] = useState(null);
  const [activeWorld, setActiveWorld]   = useState(null);
  const [xpGained, setXpGained]       = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(true);

  useEffect(() => { loadProgress(); }, []);

  async function loadProgress() {
    try {
      const data = await api.getLearnProgress();
      const map = {};
      (data.progress || []).forEach(p => { map[p.lesson_id] = p; });
      setProgress(map);
    } catch (err) { console.error(err); }
    finally { setLoadingProgress(false); }
  }

  async function handleComplete(lessonId, score, xpEarned) {
    try {
      await api.completeLesson(lessonId, score, xpEarned);
      setProgress(p => ({ ...p, [lessonId]: { lesson_id: lessonId, score, xp_earned: xpEarned } }));
      setXpGained(xpEarned);
      setTimeout(() => setXpGained(null), 3000);
    } catch (err) { console.error(err); }
  }

  function openLesson(lesson, world) {
    setActiveLesson(lesson);
    setActiveWorld(world);
  }

  // Determine which worlds are locked
  const worldCompletion = WORLDS.map(world => {
    const ids   = world.lessonIds;
    const done  = ids.filter(id => progress[id]?.score != null).length;
    return { worldId: world.id, done, total: ids.length, allDone: done === ids.length };
  });

  const totalXP = Object.values(progress).reduce((s, p) => s + (p.xp_earned || 0), 0);
  const totalCompleted = Object.keys(progress).length;
  const totalLessons = WORLDS.reduce((s, w) => s + w.lessonIds.length, 0);

  return (
    <div className="screen-card pb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="label mb-1">Learning</p>
        <h1 className="text-2xl font-black tracking-tight">Finance Path</h1>
        <p className="text-xs text-surface-400 mt-1">Level up your money IQ, one lesson at a time</p>
      </motion.div>

      {/* Top stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-3 gap-2 mb-5">
        <div className="glass-card py-3 text-center">
          <p className="text-xl font-black text-white nums">{totalCompleted}</p>
          <p className="text-2xs text-surface-400 font-semibold uppercase tracking-wider mt-0.5">Done</p>
        </div>
        <div className="glass-card py-3 text-center">
          <p className="text-xl font-black text-white nums">{totalLessons}</p>
          <p className="text-2xs text-surface-400 font-semibold uppercase tracking-wider mt-0.5">Total</p>
        </div>
        <div className="glass-card py-3 text-center">
          <p className="text-xl font-black text-brand-400 nums">+{totalXP}</p>
          <p className="text-2xs text-surface-400 font-semibold uppercase tracking-wider mt-0.5">XP</p>
        </div>
      </motion.div>

      {/* World path */}
      {loadingProgress ? (
        <div className="flex flex-col items-center gap-3">
          {[1,2,3].map(i => <div key={i} className="w-full h-24 glass-card animate-pulse bg-surface-700 rounded-2xl" />)}
        </div>
      ) : (
        <div className="flex flex-col">
          {WORLDS.map((world, wi) => {
            const prevWorldDone = wi === 0 ? true : worldCompletion[wi - 1].allDone;
            const worldLocked   = !prevWorldDone;
            const wc            = worldCompletion[wi];

            return (
              <div key={world.id}>
                {/* World banner */}
                <WorldBanner
                  world={world}
                  completedCount={wc.done}
                  totalCount={wc.total}
                  locked={worldLocked}
                />

                {/* Lesson nodes — zigzag layout */}
                <div className="flex flex-col items-center mb-6">
                  {world.lessonIds.map((lessonId, li) => {
                    const lesson = LESSON_MAP[lessonId];
                    if (!lesson) return null;

                    // Lock all lessons in a locked world, or lock if previous lesson not attempted
                    const prevDone = li === 0
                      ? !worldLocked
                      : progress[world.lessonIds[li - 1]] != null;
                    const locked = worldLocked || !prevDone;
                    const p      = progress[lessonId];
                    const stars  = p ? getStars(p.score) : 0;
                    const prevStars = li > 0 ? (progress[world.lessonIds[li - 1]] ? getStars(progress[world.lessonIds[li - 1]].score) : 0) : 1;

                    // Zigzag: alternate left / center / right
                    const positions = ['ml-0', 'ml-16', 'ml-32', 'ml-16', 'ml-0'];
                    const offset    = positions[li % positions.length];

                    return (
                      <div key={lessonId} className="flex flex-col items-start w-full">
                        {/* Connector from previous */}
                        {li > 0 && (
                          <div className={`flex flex-col items-center ${positions[(li - 1) % positions.length]}`}
                            style={{ marginLeft: `calc(${['0px','4rem','8rem','4rem','0px'][(li-1) % 5]} + 2.5rem)` }}>
                            <Connector color={world.color} done={prevStars > 0} />
                          </div>
                        )}

                        <div className={`${offset}`}>
                          <LessonNode
                            lesson={lesson}
                            world={world}
                            progress={progress}
                            locked={locked}
                            index={wi * 5 + li}
                            onOpen={l => openLesson(l, world)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* World spacer */}
                {wi < WORLDS.length - 1 && (
                  <div className="flex flex-col items-center mb-4">
                    <div className="w-px h-8 bg-surface-700" />
                    <div className="bg-surface-700 rounded-full px-4 py-1.5">
                      <p className="text-[10px] text-surface-500 font-medium">
                        {worldLocked || !wc.allDone ? `Complete ${world.name} to unlock next world` : '✓ World Complete!'}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-surface-700" />
                  </div>
                )}
              </div>
            );
          })}

          {/* End of path */}
          {totalCompleted === totalLessons && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="glass-card text-center py-8 border border-yellow-500/20 bg-yellow-500/5">
              <p className="text-5xl mb-3">🏆</p>
              <p className="font-black text-xl text-yellow-400 mb-1">Path Complete!</p>
              <p className="text-surface-400 text-sm">You've mastered all {totalLessons} lessons</p>
              <p className="text-brand-400 font-bold text-lg mt-2">+{totalXP} XP total</p>
            </motion.div>
          )}
        </div>
      )}

      {/* XP toast */}
      <AnimatePresence>
        {xpGained !== null && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-6 py-3 rounded-full font-bold shadow-lg z-50">
            +{xpGained} XP earned! 🎉
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lesson modal */}
      <AnimatePresence>
        {activeLesson && activeWorld && (
          <LessonView
            lesson={activeLesson}
            world={activeWorld}
            onComplete={handleComplete}
            onClose={() => { setActiveLesson(null); setActiveWorld(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
