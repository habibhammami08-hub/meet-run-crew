import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { CONFIG } from '@/config';

let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (_client) return _client;

  const url = CONFIG.SUPABASE_URL || (globalThis as any)?.window?.__ENV?.VITE_SUPABASE_URL;
  const anon = CONFIG.SUPABASE_ANON_KEY || (globalThis as any)?.window?.__ENV?.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (import.meta.env.DEV) {
      console.error('[supabase] Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
    }
    return null;
  }

  _client = createClient<Database>(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Fallback si localStorage indisponible (Safari Private / ITP)
      storage: typeof localStorage !== 'undefined' ? localStorage : sessionStorage,
    },
    global: { fetch },
    realtime: {
      params: { 
        eventsPerSecond: 10 
      },
    },
  });

  // Remove duplicate auth listener - will be handled in AuthProvider only

  return _client;
}

// Export par défaut pour la compatibilité
export const supabase = getSupabase();

// Environment check utility
export const ENV_READY = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

// Helper de vérification client
export function assertSupabaseOrThrow() {
  const c = getSupabase ? getSupabase() : null;
  if (!c) throw new Error("Supabase client indisponible (env manquantes ?)");
  return c;
}

// Rafraîchir la session avant usage sensible
export async function ensureFreshSession() {
  const c = assertSupabaseOrThrow();
  const { data: { session } } = await c.auth.getSession();
  if (!session) return { session: null };
  // Tente un refresh si token proche de l'expiration
  try { await c.auth.refreshSession(); } catch {}
  return await c.auth.getSession();
}

// Helper d'auth "safe" avec timeout et fallback
export async function getCurrentUserSafe(opts?: { timeoutMs?: number }) {
  const c: any = (typeof getSupabase === 'function' ? getSupabase() : (globalThis as any).supabase) || null;
  if (!c) return { user: null, source: "no-client" as const };

  const timeoutMs = opts?.timeoutMs ?? 5000;

  const withTimeout = <T,>(p: Promise<T>, label: string) => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label + " timeout")), timeoutMs);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });

  try {
    // 1) getUser — rapide, fiable si une session existe (persistée)
    const gu: any = await withTimeout(c.auth.getUser(), "getUser()");
    const user1 = gu?.data?.user ?? null;
    if (user1) return { user: user1, source: "getUser" as const };

    // 2) fallback getSession — au cas où getUser n'ait rien retourné mais une session existe
    const gs: any = await withTimeout(c.auth.getSession(), "getSession()");
    const user2 = gs?.data?.session?.user ?? null;
    if (user2) return { user: user2, source: "getSession" as const };

    // 3) dernier essai (bref) : refreshSession puis re-getUser
    try { await withTimeout(c.auth.refreshSession(), "refreshSession()"); } catch {}
    const gu2: any = await withTimeout(c.auth.getUser(), "getUser(2)");
    const user3 = gu2?.data?.user ?? null;
    if (user3) return { user: user3, source: "getUser2" as const };

    return { user: null, source: "none" as const };
  } catch (e: any) {
    // Ne considère pas un timeout comme "déconnecté" : on redonne une chance
    try {
      const gs: any = await c.auth.getSession();
      const user = gs?.data?.session?.user ?? null;
      if (user) return { user, source: "getSession-after-timeout" as const };
    } catch {}
    console.error("[auth] getCurrentUserSafe error:", e);
    return { user: null, source: "error" as const };
  }
}

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
  
  try {
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
      console.warn("[profile] No authenticated user found:", userError);
      return null;
    }

    const { data: profile, error: selErr } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
      
    if (selErr && selErr.code !== 'PGRST116') {
      console.error("[profile] Error fetching profile:", selErr);
      throw selErr;
    }
    
    if (profile) {
      console.debug("[profile] Existing profile found:", profile.id);
      return profile;
    }

    console.debug("[profile] Creating new profile for user:", user.id);
    const payload = {
      id: user.id,
      email: user.email ?? '',
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    };
    
    const { data: created, error: insErr } = await client
      .from('profiles')
      .insert(payload)
      .select('*')
      .single();
      
    if (insErr) {
      console.error("[profile] Error creating profile:", insErr);
      throw insErr;
    }
    
    console.debug("[profile] Profile created successfully:", created.id);
    return created;
  } catch (error) {
    console.error("[profile] ensureUserProfile error:", error);
    throw error;
  }
};
