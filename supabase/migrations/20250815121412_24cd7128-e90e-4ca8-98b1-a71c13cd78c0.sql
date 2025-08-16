-- Nettoyage complet : suppression des fonctions SQL custom de suppression d'utilisateur

-- Supprimer la fonction delete_user_completely
DROP FUNCTION IF EXISTS delete_user_completely(UUID);

-- Supprimer la fonction delete_user_account_v2 si elle existe
DROP FUNCTION IF EXISTS delete_user_account_v2(text);

-- Supprimer toutes les autres fonctions de suppression d'utilisateur
DROP FUNCTION IF EXISTS delete_user_completely(text);
DROP FUNCTION IF EXISTS can_delete_account();
DROP FUNCTION IF EXISTS test_delete_account();
DROP FUNCTION IF EXISTS verify_deletion_system();

-- Log du nettoyage
COMMENT ON SCHEMA public IS 'Nettoyage des fonctions de suppression utilisateur effectué';