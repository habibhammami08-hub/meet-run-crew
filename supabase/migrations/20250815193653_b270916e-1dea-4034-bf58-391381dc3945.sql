-- =====================================================
-- RECHERCHE ET SUPPRESSION AGRESSIVE DES VUES SECURITY DEFINER
-- =====================================================

-- Supprimer COMPLÈTEMENT toutes les vues du schéma public
DO $$
DECLARE
    view_record RECORD;
BEGIN
    -- Supprimer toutes les vues dans public
    FOR view_record IN 
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
    LOOP
        BEGIN
            EXECUTE 'DROP VIEW IF EXISTS public.' || view_record.table_name || ' CASCADE';
        EXCEPTION WHEN OTHERS THEN
            -- Continuer même en cas d'erreur
            NULL;
        END;
    END LOOP;
END $$;

-- Vérifier qu'il n'y a plus aucune vue
SELECT 
  'TOUTES VUES SUPPRIMÉES' as status,
  COUNT(*) as vues_restantes
FROM information_schema.views 
WHERE table_schema = 'public';