import { createClient } from "@supabase/supabase-js";

// Configuration directe pour Lovable (les variables VITE_* ne sont pas supportées)
const URL = "https://qnupinrsetomnsdchhfa.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudXBpbnJzZXRvbW5zZGNoaGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTQ0OTUsImV4cCI6MjA3MDU3MDQ5NX0.vAK-xeUxQeQy1lUz9SlzRsVTEFiyJj_HIbnP-xlLThg";

if (!URL || !KEY) {
  console.error("[supabase] Configuration Supabase manquante");
  throw new Error("Configuration Supabase incomplète");
}

// Client singleton avec configuration optimisée
export const supabase = createClient(URL, KEY, {
  auth: { 
    persistSession: true, 
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Fonction utilitaire pour vérifier la connexion
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    if (error) throw error;
    console.log("[supabase] Connexion OK");
    return true;
  } catch (error) {
    console.error("[supabase] Erreur de connexion:", error);
    return false;
  }
};