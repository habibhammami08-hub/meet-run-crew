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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("ENV_MISSING", { SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
      return json({ ok: false, error: "SERVER_MISCONFIGURED", detail: "Missing SUPABASE_URL or SERVICE_ROLE" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "MISSING_TOKEN" }, 401);

    const { data: userData, error: getUserErr } = await admin.auth.getUser(token);
    if (getUserErr || !userData?.user) {
      console.error("TOKEN_INVALID", getUserErr);
      return json({ ok: false, error: "TOKEN_INVALID" }, 401);
    }

    const userId = userData.user.id;

    // --- Suppressions explicites (ordre FK) ---
    const steps: Array<[string, PromiseLike<unknown>]> = [
      ["enrollments", admin.from("enrollments").delete().eq("user_id", userId)],
      ["registrations", admin.from("registrations").delete().eq("user_id", userId)],
      ["sessions_owned", admin.from("sessions").delete().eq("host_id", userId)],
      ["runs_owned", admin.from("runs").delete().eq("host_id", userId)],
      ["subscribers", admin.from("subscribers").delete().eq("user_id", userId)],
      ["profile", admin.from("profiles").delete().eq("id", userId)],
    ];

    for (const [name, op] of steps) {
      const res: any = await op.catch((e: any) => ({ error: e }));
      if (res?.error) {
        console.error("DELETE_STEP_FAILED", name, res.error);
        return json({ ok: false, error: "DELETE_STEP_FAILED", step: name, detail: String(res.error?.message ?? res.error) }, 500);
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
        console.warn("STORAGE_CLEANUP_WARN", b.bucket, String(e));
      }
    }

    // --- Auth user en dernier ---
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      console.error("AUTH_DELETE_FAILED", delAuthErr);
      return json({ ok: false, error: "AUTH_DELETE_FAILED", detail: String(delAuthErr.message ?? delAuthErr) }, 500);
    }

    return json({ ok: true, deleted: { files: filesDeleted } }, 200);
  } catch (e: any) {
    console.error("DELETE_ACCOUNT_FATAL", e?.message ?? e);
    return json({ ok: false, error: "FATAL", detail: String(e?.message ?? e) }, 500);
  }
});