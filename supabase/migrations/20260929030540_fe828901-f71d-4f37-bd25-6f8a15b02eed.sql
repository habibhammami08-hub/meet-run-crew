CREATE OR REPLACE VIEW public.enrollments_public AS
  SELECT session_id, user_id, status
  FROM public.enrollments
  WHERE status IN ('paid', 'included_by_subscription', 'confirmed');

GRANT SELECT ON public.enrollments_public TO anon;
GRANT SELECT ON public.enrollments_public TO authenticated;
GRANT SELECT ON public.enrollments_public TO service_role;