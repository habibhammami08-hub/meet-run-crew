import { getSupabase } from '@/integrations/supabase/client';

type DeleteResult = { ok: boolean; error?: string };

export async function deleteMyAccount(): Promise<DeleteResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponible (env manquante)' };

  // 1) Session pour que supabase-js envoie bien le JWT (Authorization: Bearer ...)
  const { data: { session }, error: sErr } = await supabase.auth.getSession();
  if (sErr || !session) return { ok: false, error: 'Session invalide' };

  // 2) Appel edge function EXISTANTE (nom exact)
  const { data, error } = await supabase.functions.invoke('Delete-Acount2', {
    body: { confirm: true },
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[delete] edge response:', { data, error });
  }

  // 3) Gestion des cas de succès les plus courants sans imposer un format précis
  if (error) return { ok: false, error: error.message || 'Erreur edge' };

  const normalized =
    // cas 204 → data === null
    data === null ||
    // cas simple "ok"
    data === 'ok' ||
    // cas { status: 'ok' }
    (typeof data === 'object' && data !== null && (data.status === 'ok' || data.status === 'OK')) ||
    // cas { success: true }
    (typeof data === 'object' && data !== null && (data.success === true)) ||
    // cas { message: 'deleted' } / 'success'
    (typeof data === 'object' && data !== null && typeof (data as any).message === 'string' &&
      /deleted|success|done|removed/i.test((data as any).message));

  if (normalized) {
    // 4) Déconnexion locale pour nettoyer l'UI
    await supabase.auth.signOut();
    return { ok: true };
  }

  // Si on arrive ici: payload inattendu → remonter l'info pour ajustement si besoin
  return { ok: false, error: 'Suppression non confirmée (payload inattendu)' };
}