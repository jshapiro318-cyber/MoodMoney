import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Server-side signup using the service role key — skips email confirmation
// so users can get into the app immediately during development.
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip confirmation email
    });

    if (error) throw error;

    // Now sign them in to get a session
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    res.json({ session: session.session, user: session.user });
  } catch (err) {
    console.error('[/auth/signup]', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
