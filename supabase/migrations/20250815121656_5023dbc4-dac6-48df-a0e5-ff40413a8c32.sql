-- Suppression simple et définitive de la fonction delete_user_completely

-- Version simple sans prosig
DROP FUNCTION IF EXISTS delete_user_completely CASCADE;

-- Vérification finale
SELECT 
  proname as function_name
FROM pg_proc 
WHERE proname LIKE '%delete_user_completely%';