-- Une seule source de vérité pour le compteur de participants.
-- Deux déclencheurs maintenaient sessions.participants_count en parallèle :
--   trg_enrollments_recount_aiud  -> recalcule le compte exact
--   trg_sync_participants_count   -> ajoute/enlève 1 par-dessus le recalcul
-- Résultat : +1 de fantôme sur les sessions avec au moins un participant.

DROP TRIGGER IF EXISTS trg_sync_participants_count ON public.enrollments;
DROP FUNCTION IF EXISTS public.sync_participants_count();

-- Recale l'existant avec la formule exacte (participants hors organisateur,
-- statuts payé / inclus par abonnement / confirmé).
UPDATE public.sessions s
   SET participants_count = COALESCE((
     SELECT COUNT(*)
     FROM public.enrollments e
     WHERE e.session_id = s.id
       AND e.status IN ('paid','included_by_subscription','confirmed')
       AND e.user_id <> s.host_id
   ), 0);