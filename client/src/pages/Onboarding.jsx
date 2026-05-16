import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import PersonalityReveal from '../components/PersonalityReveal.jsx';

// Mock transactions loaded client-side — no server call needed to start onboarding
const MOCK_TRANSACTIONS = [
  { id: 'm1',  date: '2026-05-15', name: 'DoorDash',        amount: 34.87, category: 'FOOD_AND_DRINK',     merchant: 'DoorDash' },
  { id: 'm2',  date: '2026-05-14', name: 'Uber Eats',       amount: 28.50, category: 'FOOD_AND_DRINK',     merchant: 'Uber Eats' },
  { id: 'm3',  date: '2026-05-13', name: 'Netflix',         amount: 15.49, category: 'ENTERTAINMENT',      merchant: 'Netflix' },
  { id: 'm4',  date: '2026-05-12', name: 'Spotify',         amount: 9.99,  category: 'ENTERTAINMENT',      merchant: 'Spotify' },
  { id: 'm5',  date: '2026-05-11', name: 'Amazon.com',      amount: 67.40, category: 'SHOPS',              merchant: 'Amazon' },
  { id: 'm6',  date: '2026-05-10', name: 'Starbucks',       amount: 7.45,  category: 'FOOD_AND_DRINK',     merchant: 'Starbucks' },
  { id: 'm7',  date: '2026-05-09', name: 'SHEIN',           amount: 89.99, category: 'SHOPS',              merchant: 'SHEIN' },
  { id: 'm8',  date: '2026-05-08', name: 'Uber Eats',       amount: 52.10, category: 'FOOD_AND_DRINK',     merchant: 'Uber Eats' },
  { id: 'm9',  date: '2026-05-07', name: 'Hulu',            amount: 17.99, category: 'ENTERTAINMENT',      merchant: 'Hulu' },
  { id: 'm10', date: '2026-05-06', name: 'Target',          amount: 58.32, category: 'SHOPS',              merchant: 'Target' },
  { id: 'm11', date: '2026-05-05', name: 'DoorDash',        amount: 41.20, category: 'FOOD_AND_DRINK',     merchant: 'DoorDash' },
  { id: 'm12', date: '2026-05-04', name: 'Xbox Game Pass',  amount: 14.99, category: 'ENTERTAINMENT',      merchant: 'Microsoft' },
  { id: 'm13', date: '2026-05-03', name: 'Starbucks',       amount: 6.95,  category: 'FOOD_AND_DRINK',     merchant: 'Starbucks' },
  { id: 'm14', date: '2026-05-02', name: 'Nike.com',        amount: 110.00,category: 'SHOPS',              merchant: 'Nike' },
  { id: 'm15', date: '2026-05-01', name: 'Uber Eats',       amount: 38.60, category: 'FOOD_AND_DRINK',     merchant: 'Uber Eats' },
];

const QUESTIONS = [
  {
    id: 'trigger',
    question: 'When do you most feel like spending?',
    options: [
      { value: 'stress', label: '😤 When I\'m stressed' },
      { value: 'bored',  label: '😴 When I\'m bored' },
      { value: 'happy',  label: '🎉 When I\'m celebrating' },
      { value: 'sad',    label: '😢 When I\'m feeling down' },
    ],
  },
  {
    id: 'regret',
    question: 'How often do you feel buyer\'s remorse?',
    options: [
      { value: 'always',    label: '😩 Almost every purchase' },
      { value: 'sometimes', label: '😐 Sometimes' },
      { value: 'rarely',    label: '🙂 Rarely' },
      { value: 'never',     label: '😎 Never, I earn it' },
    ],
  },
  {
    id: 'goal',
    question: 'What\'s your biggest money goal right now?',
    options: [
      { value: 'save',   label: '🏦 Build savings' },
      { value: 'invest', label: '📈 Start investing' },
      { value: 'debt',   label: '💳 Pay off debt' },
      { value: 'enjoy',  label: '✈️ Enjoy life more' },
    ],
  },
  {
    id: 'habit',
    question: 'Your most honest spending confession:',
    options: [
      { value: 'late_night',    label: '🌙 Late-night online shopping' },
      { value: 'subscriptions', label: '📱 Too many subscriptions' },
      { value: 'food',          label: '🍕 Food delivery addiction' },
      { value: 'impulse',       label: '🛍️ Impulse buys I hide' },
    ],
  },
  {
    id: 'income',
    question: 'Roughly what\'s your monthly take-home?',
    options: [
      { value: '1500', label: 'Under $1,500' },
      { value: '3000', label: '$1,500 – $3,000' },
      { value: '5000', label: '$3,000 – $5,000' },
      { value: '7500', label: '$5,000+' },
    ],
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState('welcome');
  const [answers, setAnswers] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [personality, setPersonality] = useState(null);
  const [error, setError] = useState('');

  function startQuestions() {
    setStep('questions');
  }

  function handleAnswer(questionId, value) {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      runAnalysis(newAnswers);
    }
  }

  async function runAnalysis(finalAnswers) {
    setStep('analyzing');
    setError('');
    try {
      // Save income to profile
      if (finalAnswers.income) {
        await api.updateProfile({
          monthly_income: parseInt(finalAnswers.income),
          personality_answers: finalAnswers,
        });
      }
      // Analyze personality with mock transactions
      const result = await api.analyzePersonality(finalAnswers, MOCK_TRANSACTIONS);
      setPersonality(result);
      setStep('reveal');
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Something went wrong. Try again.');
      setStep('questions');
      setQuestionIndex(QUESTIONS.length - 1);
    }
  }

  async function finishOnboarding() {
    try {
      await api.updateProfile({ onboarding_completed: true });
      await api.awardXP('completed_onboarding').catch(() => {});
    } catch (e) { /* non-fatal */ }
    navigate('/dashboard');
  }

  const currentQuestion = QUESTIONS[questionIndex];

  return (
    <AnimatePresence mode="wait">

      {step === 'welcome' && (
        <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="screen-card justify-between">
          <div className="flex flex-col items-center gap-6 pt-10">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
              className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-5xl">
              💸
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="text-center">
              <h1 className="text-4xl font-bold tracking-tight">MoodMoney</h1>
              <p className="text-surface-500 mt-3 text-base leading-relaxed">
                Your AI money therapist.<br />Understand <em>why</em> you spend.
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              className="flex flex-col gap-3 w-full mt-2 text-sm text-surface-500">
              {['🤖 Powered by Claude AI', '✨ Takes 60 seconds', '🔒 Your data stays private'].map(t => (
                <div key={t} className="flex items-center gap-2">{t}</div>
              ))}
            </motion.div>
          </div>
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
            onClick={startQuestions} className="btn-primary">
            Get started →
          </motion.button>
        </motion.div>
      )}

      {step === 'questions' && (
        <motion.div key={`q-${questionIndex}`}
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
          className="screen-card">
          <div className="w-full bg-surface-600 rounded-full h-1 mb-8">
            <motion.div className="bg-brand-500 h-1 rounded-full"
              animate={{ width: `${((questionIndex + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
          {error && (
            <div className="glass-card border border-red-500/40 bg-red-500/5 mb-4 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <p className="text-surface-500 text-sm mb-2">Question {questionIndex + 1} of {QUESTIONS.length}</p>
              <h2 className="text-2xl font-bold leading-tight">{currentQuestion.question}</h2>
            </div>
            <div className="flex flex-col gap-3">
              {currentQuestion.options.map(opt => (
                <motion.button key={opt.value} whileTap={{ scale: 0.97 }}
                  onClick={() => handleAnswer(currentQuestion.id, opt.value)}
                  className="glass-card text-left text-base font-medium active:border-brand-500 transition-colors">
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {step === 'analyzing' && (
        <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="screen-card items-center justify-center gap-8 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="text-6xl">🧠</motion.div>
          <div>
            <h2 className="text-2xl font-bold">Analyzing your money mind...</h2>
            <p className="text-surface-500 text-sm mt-2">Claude is reading your spending patterns</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div key={i} animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-brand-500" />
            ))}
          </div>
        </motion.div>
      )}

      {step === 'reveal' && personality && (
        <PersonalityReveal personality={personality} onContinue={finishOnboarding} />
      )}

    </AnimatePresence>
  );
}
