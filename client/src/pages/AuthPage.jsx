import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        // Create user server-side (skips email confirmation), then sign in normally
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Now do a real Supabase sign-in so the client session is fully established
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen-card justify-between">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 pt-8"
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #a855f7 100%)', boxShadow: '0 8px 24px rgba(249,115,22,0.35)' }}>
          M
        </div>
        <h1 className="text-[32px] font-black tracking-tight" style={{ letterSpacing: '-0.03em' }}>MoodMoney</h1>
        <p className="text-center text-sm leading-relaxed" style={{ color: '#70708a' }}>
          Understand <em>why</em> you spend,<br />not just what you spend on.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 mt-10"
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          className="input"
        />

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button type="submit" className="btn-primary mt-1" disabled={loading}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
            </span>
          ) : (
            mode === 'signup' ? 'Create account' : 'Sign in'
          )}
        </button>
      </motion.form>

      <div className="flex items-center justify-center gap-2 text-sm text-surface-500 mt-auto pt-4">
        <span>{mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}</span>
        <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}
          className="text-brand-400 font-medium">
          {mode === 'signup' ? 'Sign in' : 'Sign up free'}
        </button>
      </div>
    </div>
  );
}
