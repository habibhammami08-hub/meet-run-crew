-- =====================================================
-- MIGRATION DE NETTOYAGE - SUPPRESSION DES DOUBLONS
-- =====================================================

-- 1. SUPPRIMER TOUTES LES FONCTIONS DUPLIQUÉES
DROP FUNCTION IF EXISTS public.delete_user_completely() CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_completely(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_delete_account() CASCADE;
DROP FUNCTION IF EXISTS public.test_delete_account() CASCADE;
DROP FUNCTION IF EXISTS public.verify_deletion_system() CASCADE;
DROP FUNCTION IF EXISTS public.handle_auth_user_deleted() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_deleted_user_profile_creation() CASCADE;
DROP FUNCTION IF EXISTS public.hash_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.simple_hash_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_email_blocklist() CASCADE;

-- 2. SUPPRIMER LES TRIGGERS REDONDANTS
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP TRIGGER IF EXISTS prevent_deleted_user_profile_creation_trigger ON public.profiles;
DROP TRIGGER IF EXISTS check_deletion_blocklist_trigger ON auth.users;
DROP TRIGGER IF EXISTS check_email_blocklist_on_profile_creation ON public.profiles;

-- 3. SUPPRIMER LES VUES ET TABLES TEMPORAIRES
DROP VIEW IF EXISTS public.user_deletion_stats CASCADE;

-- 4. NETTOYER LA TABLE BLOCKLIST
DROP TABLE IF EXISTS public.deletion_blocklist CASCADE;

-- 5. REPARTIR SUR DES BASES SAINES
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.deletion_blocklist (
  id SERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deletion_blocklist_hash_blocked 
ON public.deletion_blocklist(email_hash, blocked_until);

ALTER TABLE public.deletion_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY deletion_blocklist_admin_only ON public.deletion_blocklist
  FOR ALL TO service_role
  USING (true);

-- 6. FONCTIONS UTILITAIRES
CREATE OR REPLACE FUNCTION public.hash_email_secure(email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(digest(lower(trim(email)), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.is_email_blocked(email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = public.hash_email_secure(email)
    AND blocked_until > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.hash_email_secure(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_blocked(TEXT) TO authenticated;