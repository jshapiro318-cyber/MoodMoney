import { createClient } from '@supabase/supabase-js';

// These are public keys — safe to expose in the browser.
// Row-level security in Supabase ensures users only see their own data.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
