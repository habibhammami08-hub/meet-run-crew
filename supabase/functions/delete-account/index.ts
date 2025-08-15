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

    // 5) Suppression données app (on delete cascade recommandé via profiles(id))
    const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", uid);
    if (profileDeleteError) {
      console.error("[delete-account] Profile deletion error:", profileDeleteError);
      return json({ ok: false, error: `Failed to delete profile: ${profileDeleteError.message}` }, 500);
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
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("[delete-account] Auth deletion error:", delErr);
      return json({ ok: false, error: `Failed to delete auth user: ${delErr.message}` }, 500);
    }

    console.log("[delete-account] Successfully deleted user:", uid);
    return json({ ok: true });
    
  } catch (e: any) {
    console.error("[delete-account] fatal", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});