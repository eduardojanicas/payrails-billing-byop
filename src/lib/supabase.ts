import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawAnonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const missingSupabaseEnv: string[] = [];
if (!rawUrl) missingSupabaseEnv.push('VITE_SUPABASE_URL');
if (!rawAnonKey) missingSupabaseEnv.push('VITE_SUPABASE_PUBLISHABLE_KEY');

export const isSupabaseConfigured = missingSupabaseEnv.length === 0;
export const supabaseUrl = rawUrl || '';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl!, rawAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
