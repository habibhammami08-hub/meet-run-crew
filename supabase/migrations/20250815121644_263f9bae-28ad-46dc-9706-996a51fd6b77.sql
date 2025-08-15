-- Force la suppression de TOUTES les fonctions delete_user_completely

-- Supprimer par nom exact toutes les variantes
DROP FUNCTION IF EXISTS delete_user_completely CASCADE;
DROP FUNCTION IF EXISTS delete_user_completely() CASCADE;

-- Suppression plus agressive par requête directe
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Parcourir toutes les fonctions qui matchent le pattern
    FOR func_record IN 
        SELECT oid, proname, prosig 
        FROM pg_proc 
        WHERE proname LIKE '%delete_user_completely%'
    LOOP
        BEGIN
            EXECUTE 'DROP FUNCTION ' || func_record.oid::regprocedure || ' CASCADE';
            RAISE NOTICE 'Suppression forcée de la fonction: %', func_record.oid::regprocedure;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erreur lors de la suppression de %: %', func_record.oid::regprocedure, SQLERRM;
        END;
    END LOOP;
END $$;