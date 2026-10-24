import { createClient } from '@supabase/supabase-js';

// Only the public anon key is ever used in the browser. Authorisation is enforced by RLS + Edge Functions.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'replace-with-anon-or-publishable-key',
);

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
