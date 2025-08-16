import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  
  if (!url || !anon) {
    console.error('Missing Supabase environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY');
    return null;
  }
  
  if (!_client) {
    _client = createClient<Database>(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      realtime: {
        params: { 
          eventsPerSecond: 10 
        },
      },
    });
  }
  
  return _client;
}

// Export par défaut pour la compatibilité
export const supabase = getSupabase();

// Environment check utility
export const ENV_READY = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Connection check utility
export const checkSupabaseConnection = async (): Promise<boolean> => {
  const client = getSupabase();
  if (!client) return false;
  
  try {
    const { data, error } = await client.from('profiles').select('count').limit(1);
    if (error) throw error;
    if (import.meta.env.DEV) {
      console.log("[supabase] Connection established");
    }
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[supabase] Connection error:", error);
    }
    return false;
  }
};

// Robust user profile management utility  
export const ensureUserProfile = async () => {
  const client = getSupabase();
  if (!client) return null;
  
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;

  const { data: profile, error: selErr } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (selErr && selErr.code !== 'PGRST116') throw selErr;
  if (profile) return profile;

  const payload = {
    id: user.id,
    email: user.email ?? '',
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
  };
  const { data: created, error: insErr } = await client.from('profiles').insert(payload).select('*').single();
  if (insErr) throw insErr;
  return created;
};

// Hook profile creation to auth state changes
const client = getSupabase();
if (client) {
  client.auth.onAuthStateChange(async () => {
    try { 
      await ensureUserProfile(); 
    } catch (e) { 
      console.error('[profile]', e); 
    }
  });
}