-- Configuration finale : Storage et nettoyage des politiques
-- Finalisation de la sécurité MeetRun

-- ============================================================================
-- NETTOYAGE DES POLITIQUES DUPLIQUÉES
-- ============================================================================

-- Nettoyer les politiques dupliquées sur enrollments
DROP POLICY IF EXISTS "Authenticated users can create enrollments" ON enrollments;
DROP POLICY IF EXISTS "Hosts can view session enrollments" ON enrollments;
DROP POLICY IF EXISTS "Session hosts can view enrollments for their sessions" ON enrollments;
DROP POLICY IF EXISTS "Users can create enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can update own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can update their own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can view own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can view their own enrollments" ON enrollments;

-- Nettoyer les politiques dupliquées sur profiles
DROP POLICY IF EXISTS "Public can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Nettoyer les politiques dupliquées sur sessions
DROP POLICY IF EXISTS "Authenticated can create sessions" ON sessions;
DROP POLICY IF EXISTS "Public can view all sessions" ON sessions;
DROP POLICY IF EXISTS "Public can view sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
DROP POLICY IF EXISTS "insert own sessions" ON sessions;

-- ============================================================================
-- POLITIQUES STORAGE POUR AVATARS
-- ============================================================================

-- Créer le bucket avatars s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- Supprimer les anciennes politiques storage si elles existent
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Politiques pour le bucket avatars
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================================
-- VÉRIFICATION FINALE
-- ============================================================================

-- Afficher le résumé des politiques actives
SELECT 
    'PROFILES' as table_type,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'profiles'

UNION ALL

SELECT 
    'SESSIONS' as table_type,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'sessions'

UNION ALL

SELECT 
    'ENROLLMENTS' as table_type,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'enrollments'

UNION ALL

SELECT 
    'STORAGE' as table_type,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'

ORDER BY table_type;