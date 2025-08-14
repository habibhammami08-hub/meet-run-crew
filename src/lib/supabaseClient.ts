import { createClient } from "@supabase/supabase-js";

const URL = "https://qnupinrsetomnsdchhfa.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudXBpbnJzZXRvbW5zZGNoaGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTQ0OTUsImV4cCI6MjA3MDU3MDQ5NX0.vAK-xeUxQeQy1lUz9SlzRsVTEFiyJj_HIbnP-xlLThg";

if (!URL || !KEY) console.error("[supabase] Missing URL / KEY");

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});