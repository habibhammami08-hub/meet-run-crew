import { getSupabase } from '@/integrations/supabase/client';

export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponible (env manquante)' };

  // Récupérer la session pour que supabase-js envoie le JWT (Authorization: Bearer ...)
  const { data: { session }, error: sErr } = await supabase.auth.getSession();
  if (sErr || !session) return { ok: false, error: 'Session invalide' };

  if (import.meta.env.DEV) console.log('[delete] invoking Delete-Acount2');

  // IMPORTANT: utiliser le NOM EXACT de la fonction existante (avec majuscules + typo)
  const { data, error } = await supabase.functions.invoke('Delete-Acount2', {
    body: { confirm: true },
  });

  if (error) return { ok: false, error: error.message || 'Erreur edge' };
  if (!data || data.status !== 'ok') return { ok: false, error: (data?.error || 'Suppression non confirmée') };

  // Déconnexion locale et nettoyage UI
  await supabase.auth.signOut();
  return { ok: true };
}