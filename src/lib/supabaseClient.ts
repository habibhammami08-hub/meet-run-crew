import { createClient } from "@supabase/supabase-js";

const URL =
  (window as any).__ENV__?.PUBLIC_SUPABASE_URL ||
  (import.meta as any).env?.PUBLIC_SUPABASE_URL ||
  "https://qnupinrsetomnsdchhfa.supabase.co";
const KEY =
  (window as any).__ENV__?.PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudXBpbnJzZXRvbW5zZGNoaGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTQ0OTUsImV4cCI6MjA3MDU3MDQ5NX0.vAK-xeUxQeQy1lUz9SlzRsVTEFiyJj_HIbnP-xlLThg";

if (!URL || !KEY) console.error("[supabase] Missing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createClient(URL!, KEY!, {
  auth: { persistSession: true, autoRefreshToken: true },
});