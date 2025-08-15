import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "content-type": "application/json" }, status });

// Fonction pour hasher un email (pour la blocklist)
async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Configuration Supabase - doit pointer vers le même projet que le front
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://qnupinrsetomnsdchhfa.supabase.co";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    // Logs pour debugging (projet et configuration)
    console.log("[delete-account] Configuration:", { 
      url: SUPABASE_URL, 
      hasServiceRole: !!SERVICE_ROLE,
      expectedProject: "qnupinrsetomnsdchhfa"
    });
    
    if (!SERVICE_ROLE) {
      console.error("[delete-account] SERVICE_ROLE manquant");
      return json({ ok: false, error: "SERVER_MISCONFIGURED", detail: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    // Vérifier que nous utilisons le bon projet
    if (!SUPABASE_URL.includes("qnupinrsetomnsdchhfa")) {
      console.error("[delete-account] Mauvais projet Supabase:", SUPABASE_URL);
      return json({ ok: false, error: "WRONG_PROJECT", detail: "URL Supabase incorrecte" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      console.error("[delete-account] Token manquant");
      return json({ ok: false, error: "MISSING_TOKEN" }, 401);
    }

    const { data: userData, error: getUserErr } = await admin.auth.getUser(token);
    if (getUserErr || !userData?.user) {
      console.error("[delete-account] Token invalide:", getUserErr);
      return json({ ok: false, error: "TOKEN_INVALID" }, 401);
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    
    console.log("[delete-account] Début suppression:", { userId, email: userEmail });

    // --- Suppressions explicites (ordre FK) ---
    const steps: Array<[string, PromiseLike<unknown>]> = [
      ["enrollments", admin.from("enrollments").delete().eq("user_id", userId)],
      ["registrations", admin.from("registrations").delete().eq("user_id", userId)],
      ["sessions_owned", admin.from("sessions").delete().eq("host_id", userId)],
      ["runs_owned", admin.from("runs").delete().eq("host_id", userId)],
      ["subscribers", admin.from("subscribers").delete().eq("user_id", userId)],
      ["profile", admin.from("profiles").delete().eq("id", userId)],
    ];

    const deletionStats: Record<string, number> = {};
    
    for (const [name, op] of steps) {
      try {
        const res: any = await op;
        const count = res?.count || 0;
        deletionStats[name] = count;
        console.log(`[delete-account] ${name}: ${count} enregistrement(s) supprimé(s)`);
      } catch (error: any) {
        console.error(`[delete-account] Erreur ${name}:`, error);
        return json({ 
          ok: false, 
          error: "DELETE_STEP_FAILED", 
          step: name, 
          detail: String(error?.message ?? error) 
        }, 500);
      }
    }

    // --- Storage (best-effort) ---
    const buckets = [
      { bucket: "avatars", prefix: userId },
      { bucket: "sessions", prefix: userId },
      { bucket: "runs", prefix: userId },
    ];
    let filesDeleted = 0;
    for (const b of buckets) {
      try {
        const { data: files, error: listErr } = await admin.storage.from(b.bucket).list(b.prefix, { limit: 1000 });
        if (!listErr && files?.length) {
          const paths = files.map((f: any) => `${b.prefix}/${f.name}`);
          const { error: delErr } = await admin.storage.from(b.bucket).remove(paths);
          if (!delErr) filesDeleted += paths.length;
        }
      } catch (e) {
        console.warn("[delete-account] Storage cleanup warning:", b.bucket, String(e));
      }
    }
    
    console.log(`[delete-account] Storage: ${filesDeleted} fichier(s) supprimé(s)`);

    // --- Ajouter à la blocklist pour empêcher reconnexion immédiate ---
    if (userEmail) {
      try {
        const blockUntil = new Date();
        blockUntil.setDate(blockUntil.getDate() + 7); // Bloquer 7 jours
        
        await admin.from("deletion_blocklist").upsert({
          email_hash: await hashEmail(userEmail),
          blocked_until: blockUntil.toISOString(),
          original_user_id: userId
        });
        
        console.log("[delete-account] Email ajouté à la blocklist jusqu'au:", blockUntil.toISOString());
      } catch (e) {
        console.warn("[delete-account] Erreur blocklist (non critique):", String(e));
      }
    }

    // --- Auth user en dernier ---
    console.log("[delete-account] Suppression auth user...");
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      console.error("[delete-account] Erreur suppression auth:", delAuthErr);
      return json({ ok: false, error: "AUTH_DELETE_FAILED", detail: String(delAuthErr.message ?? delAuthErr) }, 500);
    }

    console.log("[delete-account] Suppression terminée avec succès:", {
      userId,
      email: userEmail,
      deletionStats,
      filesDeleted
    });

    return json({ 
      ok: true, 
      deleted: { 
        ...deletionStats,
        files: filesDeleted,
        user_id: userId 
      } 
    }, 200);
  } catch (e: any) {
    console.error("DELETE_ACCOUNT_FATAL", e?.message ?? e);
    return json({ ok: false, error: "FATAL", detail: String(e?.message ?? e) }, 500);
  }
});