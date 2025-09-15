// src/integrations/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // ✅ Laisse Supabase persister la session en localStorage
      persistSession: true,
      // ✅ Renouvelle automatiquement le JWT avant l’expiration
      autoRefreshToken: true,
      // ✅ Nécessaire si tu utilises des magic links (sinon sans effet)
      detectSessionInUrl: true,
      // Stockage côté navigateur (évite toute logique custom)
      storage: window.localStorage,
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
