REVOKE EXECUTE ON FUNCTION public.app_delete_account() FROM public;
REVOKE EXECUTE ON FUNCTION public.app_delete_user_data(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.check_email_blocklist() FROM public;
REVOKE EXECUTE ON FUNCTION public.enrollments_after_change_recount() FROM public;
REVOKE EXECUTE ON FUNCTION public.enrollments_check_gender() FROM public;
REVOKE EXECUTE ON FUNCTION public.enrollments_guard_status() FROM public;
REVOKE EXECUTE ON FUNCTION public.enrollments_no_host_rows() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_available_spots(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_stats(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(profiles) FROM public;
REVOKE EXECUTE ON FUNCTION public.hash_email_secure(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_email_blocked(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_if_count_gt1() FROM public;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_billing() FROM public;
REVOKE EXECUTE ON FUNCTION public.recalc_participants_count(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.sessions_purge_new_host_enrollment() FROM public;
REVOKE EXECUTE ON FUNCTION public.sessions_recount_on_host_change() FROM public;
REVOKE EXECUTE ON FUNCTION public.set_timestamp() FROM public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public;

-- Les deux fonctions réellement appelées par l'app restent ouvertes aux membres connectés uniquement
REVOKE EXECUTE ON FUNCTION public.leave_or_delete_session(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_or_delete_session(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_delete_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_account() TO authenticated;