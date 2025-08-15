import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Json = Record<string, unknown>;
const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Récupérer l'utilisateur à partir du Bearer token
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing bearer token" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

    const userId = userData.user.id;

    // 1) Suppressions explicites (ordre = évite erreurs de FK même sans CASCADE)
    //    Adapter uniquement les noms de colonnes si besoin (owner_id, user_id, etc.)
    const steps: Array<{ name: string; run: () => Promise<void> }> = [
      { name: "enrollments", run: async () => { await admin.from("enrollments").delete().eq("user_id", userId); } },
      { name: "registrations", run: async () => { await admin.from("registrations").delete().eq("user_id", userId); } },
      { name: "sessions_owned", run: async () => { await admin.from("sessions").delete().eq("host_id", userId); } },
      { name: "runs_owned", run: async () => { await admin.from("runs").delete().eq("host_id", userId); } },
      { name: "subscribers", run: async () => { await admin.from("subscribers").delete().eq("user_id", userId); } },
      { name: "profile", run: async () => { await admin.from("profiles").delete().eq("id", userId); } },
    ];

    for (const step of steps) {
      try {
        await step.run();
      } catch (e: any) {
        console.error("Deletion step failed:", step.name, e?.message ?? e);
        return json({ error: `Deletion failed at step: ${step.name}`, detail: e?.message ?? String(e) }, 500);
      }
    }

    // 2) Nettoyage Storage (best-effort — n'échoue pas la suppression globale)
    async function deleteStorage(prefixes: Array<{ bucket: string; prefix: string }>) {
      let deleted = 0;
      for (const { bucket, prefix } of prefixes) {
        try {
          const { data: files, error: listErr } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
          if (listErr) continue;
          const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
          if (paths.length) {
            const { error: delErr } = await admin.storage.from(bucket).remove(paths);
            if (!delErr) deleted += paths.length;
          }
        } catch { /* ignore storage errors */ }
      }
      return deleted;
    }

    const filesDeleted = await deleteStorage([
      { bucket: "avatars", prefix: userId },
      { bucket: "sessions", prefix: userId },
      { bucket: "runs", prefix: userId },
    ]);

    // 3) Supprimer le compte Auth en dernier (empêche toute reconnexion immédiate)
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      console.error("auth.admin.deleteUser failed", delAuthErr);
      return json({ error: "Failed to delete auth user" }, 500);
    }

    return json({ ok: true, deleted: { files: filesDeleted } });
  } catch (e: any) {
    console.error("delete-account fatal", e?.message ?? e);
    return json({ error: "Unexpected server error" }, 500);
  }
});