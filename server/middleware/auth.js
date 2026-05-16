import { getUserFromToken } from '../lib/supabase.js';

// Validate the Supabase JWT sent in the Authorization header.
// Attaches req.user so downstream routes don't need to re-verify.
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}
