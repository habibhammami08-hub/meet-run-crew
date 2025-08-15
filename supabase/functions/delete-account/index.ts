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
    // === 1. VÉRIFICATION VARIABLES D'ENVIRONNEMENT ===
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[delete-account] Variables d'environnement manquantes:", { 
        hasUrl: !!SUPABASE_URL, 
        hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY 
      });
      return json({ 
        ok: false, 
        stage: 'env', 
        error: 'missing env variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)' 
      }, 500);
    }

    // Log en DEV
    console.log("[delete-account] Configuration:", { 
      SUPABASE_URL, 
      hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY 
    });

    // === 2. CRÉATION CLIENT ADMIN ===
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
      auth: { persistSession: false } 
    });

    // === 3. AUTHENTIFICATION ===
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    
    if (!token) {
      return json({ ok: false, stage: 'auth', error: 'missing authorization token' }, 401);
    }

    const { data: userData, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
    if (getUserErr || !userData?.user) {
      console.error("[delete-account] Token invalide:", getUserErr);
      return json({ ok: false, stage: 'auth', error: 'invalid token' }, 401);
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    
    // Log userId en DEV
    console.log("[delete-account] Début suppression:", { userId, email: userEmail });

    // === 4. SUPPRESSIONS EN CASCADE ===
    const deletionStats: Record<string, number> = {};
    
    // Ordre FK correct (audit_log en premier !)
    const steps: Array<[string, () => Promise<any>]> = [
      ["audit_log", () => supabaseAdmin.from("audit_log").delete().eq("user_id", userId)],
      ["enrollments", () => supabaseAdmin.from("enrollments").delete().eq("user_id", userId)],
      ["registrations", () => supabaseAdmin.from("registrations").delete().eq("user_id", userId)],
      ["sessions_owned", () => supabaseAdmin.from("sessions").delete().eq("host_id", userId)],
      ["runs_owned", () => supabaseAdmin.from("runs").delete().eq("host_id", userId)],
      ["subscribers", () => supabaseAdmin.from("subscribers").delete().eq("user_id", userId)],
      ["profile", () => supabaseAdmin.from("profiles").delete().eq("id", userId)],
    ];

    for (const [name, operation] of steps) {
      try {
        const result = await operation();
        const count = result?.count || 0;
        deletionStats[name] = count;
        console.log(`[delete-account] ${name}: ${count} enregistrement(s) supprimé(s)`);
      } catch (error: any) {
        console.error(`[delete-account] Erreur ${name}:`, error);
        return json({ 
          ok: false, 
          stage: 'database', 
          error: `Failed to delete ${name}: ${error?.message || error}` 
        }, 500);
      }
    }

    // === 5. NETTOYAGE STORAGE (best-effort) ===
    const buckets = [
      { bucket: "avatars", prefix: userId },
      { bucket: "sessions", prefix: userId },
      { bucket: "runs", prefix: userId },
    ];
    
    let filesDeleted = 0;
    for (const b of buckets) {
      try {
        const { data: files, error: listErr } = await supabaseAdmin.storage
          .from(b.bucket)
          .list(b.prefix, { limit: 1000 });
          
        if (!listErr && files?.length) {
          const paths = files.map((f: any) => `${b.prefix}/${f.name}`);
          const { error: delErr } = await supabaseAdmin.storage
            .from(b.bucket)
            .remove(paths);
          if (!delErr) filesDeleted += paths.length;
        }
      } catch (e) {
        console.warn(`[delete-account] Storage cleanup warning (${b.bucket}):`, String(e));
      }
    }

    // === 6. SUPPRESSION AUTH USER ===
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      console.error("[delete-account] Erreur suppression auth:", delAuthErr);
      return json({ 
        ok: false, 
        stage: 'auth_delete', 
        error: `Failed to delete auth user: ${delAuthErr.message}` 
      }, 500);
    }

    // === 7. SUCCÈS ===
    console.log("[delete-account] Suppression terminée avec succès:", {
      userId,
      email: userEmail,
      deletionStats,
      filesDeleted
    });

    return json({ 
      ok: true, 
      stage: 'completed',
      deleted: { 
        ...deletionStats,
        files: filesDeleted,
        user_id: userId 
      } 
    }, 200);

  } catch (error: any) {
    // === TRY/CATCH GLOBAL ===
    console.error("[delete-account] ERREUR FATALE:", error);
    return json({ 
      ok: false, 
      stage: 'fatal', 
      error: `Unexpected error: ${error?.message || error}` 
    }, 500);
  }
});