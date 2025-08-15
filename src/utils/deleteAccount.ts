import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

/** Supprime le compte (Edge Function) + déconnecte proprement le client */
export async function deleteAccountAndSignOut(): Promise<boolean> {
  // Marqueur pour éviter recréation de profil pendant la suppression
  try {
    localStorage.setItem('deletion_in_progress', '1');
  } catch {}

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      throw new Error("Session invalide: aucun access token");
    }

    logger.info("[account-deletion] Appel Edge Function delete-account...");
    const { data, error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    logger.info("[account-deletion] Réponse de la fonction:", { data, error });

    if (error) {
      throw new Error(error.message || "Erreur lors de l'appel de la fonction de suppression");
    }

    if (!data?.ok) {
      throw new Error((data as any)?.error || "Suppression serveur non confirmée");
    }

    logger.info("[account-deletion] Suppression côté serveur réussie");
  } catch (e: any) {
    logger.error("[account-deletion] Échec suppression serveur:", e);
    // On propage l'erreur pour que l'UI affiche un message et n'indique pas un succès trompeur
    throw e;
  } finally {
    // Nettoyage client (évite "toujours connecté")
    try {
      localStorage.setItem('logout_in_progress', '1');
    } catch {}

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
    } finally {
      try { localStorage.removeItem('deletion_in_progress'); } catch {}
      try { localStorage.removeItem('logout_in_progress'); } catch {}
    }
  }

  return true;
}