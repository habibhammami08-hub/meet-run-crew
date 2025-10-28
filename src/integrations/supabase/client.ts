// src/integrations/supabase/client.ts
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { CONFIG } from "@/config";

// ————————————————————————————————————————————
// Env + singleton
// ————————————————————————————————————————————
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

/**
 * Indique si les variables d'env nécessaires sont présentes.
 * Certaines parties de l'app (ex: App.tsx) lisent ce flag.
 */
export const ENV_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let _client: SupabaseClient | null = null;

/**
 * Retourne le client Supabase (singleton).
 * - persistSession: true → l'utilisateur reste connecté
 * - autoRefreshToken: true → refresh automatique des JWT
 * - detectSessionInUrl: true → utile si tu utilises des magic links
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  if (!ENV_READY) {
    // On jette une erreur explicite pour faciliter le debug en dev.
    throw new Error(
      "[supabase] ENV non configuré. Assure-toi d'avoir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
    );
  }

  _client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce",
    },
    global: {
      headers: {
        "x-client-info": "meetrun-web",
      },
    },
  });

  return _client;
}

/**
 * Export nommé conservé pour compat' avec du code existant
 * qui importe directement { supabase }.
 * Lazy initialization pour éviter les erreurs au chargement.
 */
let _exportedClient: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_exportedClient) {
      _exportedClient = getSupabase();
    }
    return (_exportedClient as any)[prop];
  }
});

/**
 * Helper de compat' : renvoie l'utilisateur courant ou null,
 * sans throw si la session n'existe pas.
 */
export async function getCurrentUserSafe(): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}
