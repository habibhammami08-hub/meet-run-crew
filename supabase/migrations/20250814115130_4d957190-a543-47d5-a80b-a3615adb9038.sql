-- Politiques RLS pour sécuriser l'application MeetRun - Version corrigée
-- Correction : gestion des tables déjà dans realtime

-- ============================================================================
-- TABLE: profiles
-- ============================================================================

-- Activer RLS sur profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- SELECT: Tous les utilisateurs authentifiés peuvent voir tous les profils (pour les cartes/sessions)
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Seul l'utilisateur peut créer son propre profil
CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: Seul l'utilisateur peut modifier son propre profil
CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE: Seul l'utilisateur peut supprimer son propre profil
CREATE POLICY "profiles_delete_policy" ON profiles
  FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- ============================================================================
-- TABLE: sessions
-- ============================================================================

-- Activer RLS sur sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "sessions_select_policy" ON sessions;
DROP POLICY IF EXISTS "sessions_insert_policy" ON sessions;
DROP POLICY IF EXISTS "sessions_update_policy" ON sessions;
DROP POLICY IF EXISTS "sessions_delete_policy" ON sessions;

-- SELECT: Tout le monde peut voir toutes les sessions (public)
CREATE POLICY "sessions_select_policy" ON sessions
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- INSERT: Seuls les utilisateurs authentifiés peuvent créer des sessions
CREATE POLICY "sessions_insert_policy" ON sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (host_id = auth.uid());

-- UPDATE: Seul l'hôte peut modifier sa session
CREATE POLICY "sessions_update_policy" ON sessions
  FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- DELETE: Seul l'hôte peut supprimer sa session
CREATE POLICY "sessions_delete_policy" ON sessions
  FOR DELETE
  TO authenticated
  USING (host_id = auth.uid());

-- ============================================================================
-- TABLE: enrollments
-- ============================================================================

-- Activer RLS sur enrollments
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "enrollments_select_policy" ON enrollments;
DROP POLICY IF EXISTS "enrollments_insert_policy" ON enrollments;
DROP POLICY IF EXISTS "enrollments_update_policy" ON enrollments;
DROP POLICY IF EXISTS "enrollments_delete_policy" ON enrollments;

-- SELECT: Les utilisateurs peuvent voir les enrollments de leurs sessions ou leurs propres enrollments
CREATE POLICY "enrollments_select_policy" ON enrollments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- INSERT: Les utilisateurs peuvent s'inscrire aux sessions
CREATE POLICY "enrollments_insert_policy" ON enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Les utilisateurs peuvent modifier leurs propres enrollments
-- Les hôtes peuvent modifier les enrollments de leurs sessions
CREATE POLICY "enrollments_update_policy" ON enrollments
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- DELETE: Les utilisateurs peuvent supprimer leurs propres enrollments
-- Les hôtes peuvent supprimer les enrollments de leurs sessions
CREATE POLICY "enrollments_delete_policy" ON enrollments
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- ============================================================================
-- CONTRAINTES ET INDEX POUR PERFORMANCE
-- ============================================================================

-- Index pour performance des requêtes
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_session_id ON enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================================================
-- ACTIVATION REALTIME (avec vérification)
-- ============================================================================

-- Fonction pour ajouter une table à realtime de manière sécurisée
DO $$
BEGIN
    -- Ajouter enrollments à realtime si pas déjà présent
    BEGIN
        ALTER publication supabase_realtime ADD TABLE enrollments;
    EXCEPTION WHEN duplicate_object THEN
        -- Table déjà dans la publication
        NULL;
    END;
    
    -- Ajouter profiles à realtime si pas déjà présent
    BEGIN
        ALTER publication supabase_realtime ADD TABLE profiles;
    EXCEPTION WHEN duplicate_object THEN
        -- Table déjà dans la publication
        NULL;
    END;
END $$;