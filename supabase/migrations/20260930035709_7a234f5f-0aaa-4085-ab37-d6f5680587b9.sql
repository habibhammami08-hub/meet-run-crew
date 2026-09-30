-- 1) Chemin de recherche fixé sur les 3 fonctions qui en manquaient
ALTER FUNCTION public.enrollments_no_host_rows() SET search_path = public;
ALTER FUNCTION public.prevent_delete_if_count_gt1() SET search_path = public;
ALTER FUNCTION public.set_timestamp() SET search_path = public;

-- 2) Les fonctions internes ne sont plus appelables directement (visiteurs et membres)
REVOKE EXECUTE ON FUNCTION public.app_delete_account() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.app_delete_user_data(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_email_blocklist() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrollments_after_change_recount() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrollments_check_gender() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrollments_guard_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrollments_no_host_rows() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_available_spots(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_stats(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(profiles) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_email_secure(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_email_blocked(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_if_count_gt1() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_billing() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_participants_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sessions_purge_new_host_enrollment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sessions_recount_on_host_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_timestamp() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;