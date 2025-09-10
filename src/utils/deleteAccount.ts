import { getSupabase } from '@/integrations/supabase/client';

type DeleteResult = { ok: boolean; error?: string; details?: any };

export async function deleteMyAccount(): Promise<DeleteResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponible (variables d\'environnement manquantes)' };

  try {
    // 1) Vérifier la session pour que supabase-js envoie bien le JWT
    const { data: { session }, error: sErr } = await supabase.auth.getSession();
    if (sErr || !session) return { ok: false, error: 'Session invalide ou expirée' };

    console.log('[deleteAccount] Calling delete-account2 edge function...');

    // 2) Appel à l'edge function
    const { data, error } = await supabase.functions.invoke('delete-account2', {
      body: { confirm: true },
    });

    console.log('[deleteAccount] Edge function response:', { data, error });

    // 3) Gestion des erreurs de l'edge function
    if (error) {
      console.error('[deleteAccount] Edge function error:', error);
      return { 
        ok: false, 
        error: `Erreur de suppression: ${error.message || 'Erreur inconnue'}` 
      };
    }

    // 4) Vérifier le succès de la suppression
    const isSuccess = 
      data === null ||
      data === 'ok' ||
      (typeof data === 'object' && data !== null && (
        data.status === 'ok' || 
        data.status === 'OK' ||
        data.success === true
      ));

    if (!isSuccess) {
      return { 
        ok: false, 
        error: 'La suppression n\'a pas pu être confirmée. Veuillez réessayer.' 
      };
    }

    console.log('[deleteAccount] Account deletion successful, cleaning up local state...');

    // 5) Nettoyage local immédiat
    try {
      // Déconnexion Supabase
      await supabase.auth.signOut();
      
      // Nettoyage du localStorage et sessionStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // Nettoyer les cookies de session si présents
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=");
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });
      
    } catch (cleanupError) {
      console.error('[deleteAccount] Cleanup error (non-fatal):', cleanupError);
    }

    return { 
      ok: true, 
      details: data 
    };

  } catch (networkError) {
    console.error('[deleteAccount] Network or unexpected error:', networkError);
    return { 
      ok: false, 
      error: `Erreur réseau: ${networkError instanceof Error ? networkError.message : 'Erreur inconnue'}` 
    };
  }
}