import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import { LESSONS, CATEGORIES } from '../lib/lessons.js';

const DIFFICULTY_CONFIG = {
  beginner:     { label: 'Beginner',     color: 'text-green-400',  bg: 'bg-green-500/15',  xp: 10 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-400', bg: 'bg-yellow-500/15', xp: 20 },
  advanced:     { label: 'Advanced',     color: 'text-red-400',    bg: 'bg-red-500/15',    xp: 30 },
};

function QuizQuestion({ question, index, total, onAnswer, answered }) {
  const [selected, setSelected] = useState(null);

  function choose(i) {
    if (selected !== null) return;
    setSelected(i);
    setTimeout(() => onAnswer(i === question.correct), 900);
  }

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
      className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-surface-500">Question {index + 1} of {total}</p>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={`w-6 h-1 rounded-full ${i < index ? 'bg-brand-500' : i === index ? 'bg-brand-500/50' : 'bg-surface-600'}`} />
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

function LessonView({ lesson, onComplete, onClose }) {
  const [phase, setPhase] = useState('read'); // read | quiz | result
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);

  function startQuiz() { setPhase('quiz'); }

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

  return (
    <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 30 }}
      className="fixed inset-0 bg-surface-900 z-50 overflow-y-auto">
      <div className="max-w-md mx-auto p-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <button onClick={onClose} className="text-surface-500 text-sm">← Back</button>
          <div className={`pill text-xs ${DIFFICULTY_CONFIG[lesson.difficulty]?.bg} ${DIFFICULTY_CONFIG[lesson.difficulty]?.color}`}>
            {DIFFICULTY_CONFIG[lesson.difficulty]?.label} · +{lesson.xp} XP
          </div>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'read' && (
            <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6">
                <span className="text-6xl block mb-3">{lesson.emoji}</span>
                <h1 className="text-2xl font-bold mb-1">{lesson.title}</h1>
                <p className="text-surface-500 text-sm">{lesson.description}</p>
              </div>

              <div className="glass-card mb-6">
                <p className="text-base leading-relaxed text-surface-200">{lesson.content}</p>
              </div>

              <div className="glass-card bg-brand-500/10 border border-brand-500/20 mb-6">
                <p className="text-xs text-brand-400 font-medium mb-1">📝 Quiz coming up</p>
                <p className="text-sm text-surface-300">{lesson.questions.length} questions · Need 75% to earn full XP</p>
              </div>

              <motion.button whileTap={{ scale: 0.97 }} onClick={startQuiz} className="btn-primary w-full">
                Start Quiz →
              </motion.button>
            </motion.div>
          )}

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

          {phase === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center gap-4 pt-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
                className="text-7xl">
                {score >= 75 ? '🎉' : score >= 50 ? '😐' : '💪'}
              </motion.div>

              <div>
                <h2 className="text-3xl font-black mb-1">{score}%</h2>
                <p className="text-surface-400">
                  {correct} / {lesson.questions.length} correct
                </p>
              </div>

              <div className={`w-full rounded-2xl p-4 ${score >= 75 ? 'bg-green-500/15 border border-green-500/20' : 'bg-surface-700/50'}`}>
                {score >= 75 ? (
                  <>
                    <p className="font-bold text-green-400 mb-1">Lesson Complete! 🏆</p>
                    <p className="text-sm text-surface-300">You earned +{lesson.xp} XP</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold mb-1">Almost there!</p>
                    <p className="text-sm text-surface-400">You earned +{Math.round(lesson.xp * 0.5)} XP. Retry to get full marks.</p>
                  </>
                )}
              </div>

              <button onClick={onClose} className="btn-primary w-full mt-2">← Back to lessons</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function Learn() {
  const [progress, setProgress] = useState({});
  const [category, setCategory] = useState('All');
  const [difficulty, setDifficulty] = useState('all');
  const [activeLesson, setActiveLesson] = useState(null);
  const [xpGained, setXpGained] = useState(null);

  useEffect(() => { loadProgress(); }, []);

  async function loadProgress() {
    try {
      const data = await api.getLearnProgress();
      const map = {};
      (data.progress || []).forEach(p => { map[p.lesson_id] = p; });
      setProgress(map);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleComplete(lessonId, score, xpEarned) {
    try {
      await api.completeLesson(lessonId, score, xpEarned);
      setProgress(p => ({ ...p, [lessonId]: { lesson_id: lessonId, score, xp_earned: xpEarned } }));
      setXpGained(xpEarned);
      setTimeout(() => setXpGained(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }

  const filtered = LESSONS.filter(l => {
    if (category !== 'All' && l.category !== category) return false;
    if (difficulty !== 'all' && l.difficulty !== difficulty) return false;
    return true;
  });

  const totalXP = Object.values(progress).reduce((s, p) => s + (p.xp_earned || 0), 0);
  const completedCount = Object.keys(progress).length;

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-1">Learn Finance 📚</h1>
        <p className="text-surface-500 text-sm mb-4">Level up your money IQ — one lesson at a time</p>
      </motion.div>

      {/* Progress banner */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="glass-card mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500">Your Progress</p>
          <p className="font-bold">{completedCount} / {LESSONS.length} lessons</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-surface-500">XP Earned</p>
          <p className="font-black text-brand-400 text-lg">+{totalXP} XP</p>
        </div>
        <div className="w-16 h-16">
          <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-full h-full">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#26262c" strokeWidth="3" />
            <motion.circle cx="18" cy="18" r="15.9" fill="none" stroke="#f97316" strokeWidth="3"
              strokeLinecap="round"
              initial={{ strokeDasharray: '0 100' }}
              animate={{ strokeDasharray: `${(completedCount / LESSONS.length) * 100} 100` }}
              transition={{ duration: 1 }} />
          </svg>
        </div>
      </motion.div>

      {/* Category filter */}
      <div className="overflow-x-auto pb-1 mb-3">
        <div className="flex gap-2 w-max">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`pill text-xs whitespace-nowrap ${category === c ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty filter */}
      <div className="flex gap-2 mb-5">
        {[['all', 'All'], ['beginner', '🟢 Beginner'], ['intermediate', '🟡 Mid'], ['advanced', '🔴 Advanced']].map(([val, label]) => (
          <button key={val} onClick={() => setDifficulty(val)}
            className={`pill text-xs flex-1 ${difficulty === val ? 'bg-surface-600 text-white' : 'bg-surface-800 text-surface-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Lesson grid */}
      <div className="flex flex-col gap-3">
        {filtered.map((lesson, i) => {
          const done = progress[lesson.id];
          const cfg = DIFFICULTY_CONFIG[lesson.difficulty];
          return (
            <motion.button key={lesson.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }} whileTap={{ scale: 0.98 }}
              onClick={() => setActiveLesson(lesson)}
              className={`glass-card text-left relative overflow-hidden ${done?.score >= 75 ? 'border border-green-500/20' : ''}`}>

              {/* Completed ribbon */}
              {done?.score >= 75 && (
                <div className="absolute top-2 right-2 text-green-400 text-lg">✓</div>
              )}

              <div className="flex items-start gap-3">
                <span className="text-3xl">{lesson.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-bold text-sm">{lesson.title}</span>
                    <span className={`pill text-[10px] ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-surface-500 mb-2">{lesson.description}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-brand-400 font-medium">+{lesson.xp} XP</span>
                    <span className="text-xs text-surface-600">{lesson.category}</span>
                    {done && (
                      <span className={`text-xs font-medium ${done.score >= 75 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {done.score}% score
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

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
        {activeLesson && (
          <LessonView
            lesson={activeLesson}
            onComplete={handleComplete}
            onClose={() => setActiveLesson(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
