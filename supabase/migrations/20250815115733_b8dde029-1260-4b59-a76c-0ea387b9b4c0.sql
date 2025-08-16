-- Fonction PostgreSQL pour supprimer un utilisateur et toutes ses données
-- Cette fonction contourne les limitations de l'API et accède directement à la DB

CREATE OR REPLACE FUNCTION delete_user_completely(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
    result_data JSON;
    deleted_counts JSON;
    error_msg TEXT;
BEGIN
    -- Log du début
    RAISE NOTICE 'Starting complete deletion for user: %', user_uuid;
    
    -- Initialiser le compteur de suppressions
    deleted_counts := '{}'::JSON;
    
    BEGIN
        -- 1. Supprimer les données utilisateur dans l'ordre correct
        RAISE NOTICE 'Deleting user data...';
        
        -- Audit log
        DELETE FROM audit_log WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.audit_log', ROW_COUNT);
        
        -- Enrollments
        DELETE FROM enrollments WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.enrollments', ROW_COUNT);
        
        -- Registrations  
        DELETE FROM registrations WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.registrations', ROW_COUNT);
        
        -- Subscribers
        DELETE FROM subscribers WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.subscribers', ROW_COUNT);
        
        -- Sessions (host_id)
        DELETE FROM sessions WHERE host_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.sessions', ROW_COUNT);
        
        -- Runs (host_id)
        DELETE FROM runs WHERE host_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.runs', ROW_COUNT);
        
        -- Profiles (utilise id directement)
        DELETE FROM profiles WHERE id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.profiles', ROW_COUNT);
        
        RAISE NOTICE 'User data deleted successfully';
        
        -- 2. Supprimer les sessions et tokens auth
        RAISE NOTICE 'Deleting auth sessions and tokens...';
        
        DELETE FROM auth.sessions WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.auth_sessions', ROW_COUNT);
        
        DELETE FROM auth.refresh_tokens WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.auth_refresh_tokens', ROW_COUNT);
        
        -- Supprimer les entrées d'audit auth si elles existent
        DELETE FROM auth.audit_log_entries WHERE user_id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.auth_audit_log', ROW_COUNT);
        
        RAISE NOTICE 'Auth sessions deleted successfully';
        
        -- 3. Supprimer l'utilisateur auth (étape finale)
        RAISE NOTICE 'Deleting auth user...';
        
        DELETE FROM auth.users WHERE id = user_uuid;
        GET DIAGNOSTICS deleted_counts = JSON_SET(deleted_counts, '$.auth_users', ROW_COUNT);
        
        RAISE NOTICE 'Auth user deleted successfully';
        
        -- 4. Construire la réponse de succès
        result_data := JSON_BUILD_OBJECT(
            'success', true,
            'message', 'User completely deleted',
            'user_id', user_uuid,
            'deleted_counts', deleted_counts,
            'timestamp', NOW()
        );
        
        RAISE NOTICE 'Complete deletion successful for user: %', user_uuid;
        
        RETURN result_data;
        
    EXCEPTION WHEN OTHERS THEN
        -- En cas d'erreur, capturer le message
        GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
        
        RAISE NOTICE 'Error during deletion: %', error_msg;
        
        -- Construire la réponse d'erreur
        result_data := JSON_BUILD_OBJECT(
            'success', false,
            'error', error_msg,
            'user_id', user_uuid,
            'partial_deleted_counts', deleted_counts,
            'timestamp', NOW()
        );
        
        RETURN result_data;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accorder les permissions nécessaires
GRANT EXECUTE ON FUNCTION delete_user_completely(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_completely(UUID) TO service_role;