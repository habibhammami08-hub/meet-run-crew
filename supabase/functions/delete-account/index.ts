import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "content-type": "application/json" }, status });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    // 1) ENV (configurer dans Dashboard > Edge Functions)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    console.log("[delete-account] Configuration:", {
      SUPABASE_URL,
      hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY
    });
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[delete-account] Missing env", { 
        hasUrl: !!SUPABASE_URL, 
        hasAnon: !!SUPABASE_ANON_KEY, 
        hasService: !!SUPABASE_SERVICE_ROLE_KEY 
      });
      return json({ ok: false, error: "Missing env vars" }, 500);
    }

    // 2) Bearer token depuis le client
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    // 3) Clients
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { 
      global: { headers: { Authorization: `Bearer ${token}` } } 
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4) Récup user depuis le token
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("[delete-account] Invalid token:", userErr);
      return json({ ok: false, error: "invalid token" }, 401);
    }
    
    const uid = userData.user.id;
    console.log("[delete-account] Deleting user:", uid);

    // 5) Suppression données app manuelle avec logging détaillé
    console.log("[delete-account] Début suppression:", { userId: uid, email: userData.user.email });
    
    // Suppression dans l'ordre inverse des FK pour éviter les contraintes
    const tables = ['audit_log', 'enrollments', 'registrations', 'sessions_owned', 'runs_owned', 'subscribers', 'profiles'];
    
    for (const table of tables) {
      try {
        const actualTable = table === 'sessions_owned' ? 'sessions' : table === 'runs_owned' ? 'runs' : table;
        const column = table === 'sessions_owned' || table === 'runs_owned' ? 'host_id' : 
                      table === 'profiles' ? 'id' : 'user_id';
        
        const deleteResult = await admin.from(actualTable)
          .delete()
          .eq(column, uid);
        
        const count = deleteResult.count || 0;
        console.log(`[delete-account] ${table}: ${count} enregistrement(s) supprimé(s)`);
        
        if (deleteResult.error) {
          console.error(`[delete-account] Erreur lors de la suppression: ${deleteResult.error.message}`);
        }
      } catch (e) {
        console.error(`[delete-account] Erreur suppression ${table}:`, e);
      }
    }

    // 6) (Optionnel) Nettoyage Storage
    try {
      const buckets = ["avatars"]; // ajoute d'autres buckets si besoin
      for (const bucket of buckets) {
        const { data: files, error: listError } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
        if (!listError && files?.length) {
          const filePaths = files.map(f => `${uid}/${f.name}`);
          const { error: removeError } = await admin.storage.from(bucket).remove(filePaths);
          if (removeError) {
            console.warn(`[delete-account] Storage cleanup warning for ${bucket}:`, removeError);
          }
        }
      }
    } catch (e) {
      console.warn("[delete-account] storage cleanup warning:", e);
    }

    // 7) Suppression Auth en dernier
    console.log("[delete-account] Suppression auth user avec admin.deleteUser...");
    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(uid);
      if (delErr) {
        console.error("[delete-account] Erreur suppression auth:", delErr);
        return json({ ok: false, error: `Failed to delete auth user: ${delErr.message}` }, 500);
      }
    } catch (e) {
      console.error("[delete-account] Exception lors de deleteUser:", e);
      return json({ ok: false, error: `Exception during auth deletion: ${e.message}` }, 500);
    }

    console.log("[delete-account] Successfully deleted user:", uid);
    return json({ ok: true });
    
  } catch (e: any) {
    console.error("[delete-account] fatal", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});