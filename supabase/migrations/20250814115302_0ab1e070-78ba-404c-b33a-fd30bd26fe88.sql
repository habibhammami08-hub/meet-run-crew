-- Correction des avertissements de sécurité détectés par le linter

-- ============================================================================
-- CORRECTION 1 & 2: Function Search Path Mutable
-- ============================================================================

-- Corriger la fonction backfill_missing_profiles
CREATE OR REPLACE FUNCTION backfill_missing_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, created_at, updated_at)
    SELECT 
        au.id,
        au.email,
        COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
        au.created_at,
        NOW()
    FROM auth.users au
    WHERE au.id NOT IN (SELECT id FROM profiles)
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Backfill des profils terminé';
END;
$$;

-- Corriger la fonction handle_new_user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;