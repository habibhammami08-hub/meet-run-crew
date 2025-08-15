-- Suppression finale de toutes les fonctions de suppression d'utilisateur restantes

-- Supprimer la fonction delete_user_completely avec tous les types de paramètres possibles
DROP FUNCTION IF EXISTS delete_user_completely(UUID) CASCADE;
DROP FUNCTION IF EXISTS delete_user_completely(TEXT) CASCADE;
DROP FUNCTION IF EXISTS delete_user_completely(VARCHAR) CASCADE;

-- Vérifier qu'il ne reste aucune fonction liée à la suppression d'utilisateur
-- Cette requête nous dira s'il reste des fonctions suspectes
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM pg_proc 
    WHERE proname LIKE '%delete%user%' 
       OR proname LIKE '%delete_user%'
       OR proname LIKE '%account%delete%';
    
    IF func_count > 0 THEN
        RAISE NOTICE 'Il reste encore % fonction(s) de suppression utilisateur', func_count;
    ELSE
        RAISE NOTICE 'Toutes les fonctions de suppression utilisateur ont été supprimées';
    END IF;
END $$;