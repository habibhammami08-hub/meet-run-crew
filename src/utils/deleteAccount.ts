import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

/** Supprime le compte (Edge Function) + déconnecte proprement le client */
export async function deleteAccountAndSignOut(): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (accessToken) {
      logger.info("[account-deletion] Appel Edge Function Delete-Acount2...");
      const { data, error } = await supabase.functions.invoke("Delete-Acount2", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      logger.info("[account-deletion] Réponse de la fonction:", { data, error });
      
      if (error) {
        logger.warn("[account-deletion] Function erreur (on continue le nettoyage local):", error);
      } else if (data?.ok) {
        logger.info("[account-deletion] Suppression côté serveur réussie");
      }
    } else {
      logger.warn("[account-deletion] Pas d'access token; on nettoie localement.");
    }
  } catch (e) {
    logger.warn("[account-deletion] Erreur appel function (on continue local):", e);
  }

  // Nettoyage client (évite "toujours connecté")
  try {
    try {
      // @ts-ignore
      supabase.realtime.removeAllChannels?.();
      // @ts-ignore
      supabase.realtime.disconnect?.();
    } catch {}

    try { 
      await supabase.auth.signOut({ scope: "local" }); 
    } catch {}
    
    try { 
      await supabase.auth.signOut({ scope: "global" }); 
    } catch (e) { 
      console.warn("signOut global:", e); 
    }

    try { 
      localStorage.clear(); 
      sessionStorage.clear(); 
    } catch {}

    try {
      // @ts-ignore
      if (indexedDB && typeof indexedDB.databases === "function") {
        // @ts-ignore
        const dbs = await indexedDB.databases();
        for (const db of dbs) { 
          if (db.name) indexedDB.deleteDatabase(db.name); 
        }
      }
    } catch {}

    try {
      document.cookie.split(";").forEach(c => { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;");
      });
    } catch {}

    return true;
  } catch (e) {
    console.error("[account-deletion] Erreur nettoyage local:", e);
    return false;
  }
}