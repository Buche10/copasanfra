import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// True only when both env vars are present. Checked before any network call
// so a missing configuration surfaces as a friendly runtime error instead of
// crashing the build (this module is imported during static generation too).
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws on an invalid URL, so fall back to a syntactically valid
// placeholder when unconfigured. Real calls will still fail and be reported.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

// Table names. Each table stores one entity per row as { id, data (jsonb) },
// which preserves the exact TypeScript shapes used across the app.
export const TABLES = {
  TEAMS: 'teams',
  PLAYERS: 'players',
  // Public, read-only view of players with sensitive fields (cedula,
  // verificationDoc) stripped out. Used for all non-authenticated reads.
  PLAYERS_PUBLIC: 'players_public',
  MATCHES: 'matches',
  USERS: 'users',
} as const;
