CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_status ON public.sessions (scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_sessions_start_coords ON public.sessions (start_lat, start_lng);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON public.sessions (host_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status ON public.enrollments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_session ON public.enrollments (session_id, status);