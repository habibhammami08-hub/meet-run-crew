// Deno Deploy / Supabase Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

    // Auth du user courant (JWT transmis automatiquement si invoke côté client)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const { data: { user }, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !user) {
      console.error("User verification error:", uErr);
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const userId = user.id;
    console.log(`Deleting account for user: ${userId}`);

    // Supprime le profil (sessions seront supprimées via FK CASCADE)
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) {
      console.error("Error deleting profile:", profileError);
    }

    // Supprime l'utilisateur auth
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("Error deleting user:", delErr);
      return new Response(JSON.stringify({ error: delErr.message }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`Account successfully deleted for user: ${userId}`);
    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error("Delete account error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});