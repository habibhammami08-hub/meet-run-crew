-- Nettoyer l'ancien système de blocklist qui ne fonctionnait pas
DROP TRIGGER IF EXISTS prevent_deleted_user_profile_creation_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_deleted_user_profile_creation();
DROP FUNCTION IF EXISTS public.simple_hash_email(text);
DROP FUNCTION IF EXISTS public.hash_email(text);
DROP TABLE IF EXISTS public.deletion_blocklist;