import { supabase } from '@/integrations/supabase/client';

interface DeleteAccountResponse {
  success: boolean;
  message: string;
  deleted_data?: {
    sessions: number;
    enrollments: number;
    profile: boolean;
  };
  subscription_info?: {
    had_active_subscription: boolean;
    renewal_cancelled: boolean;
    expires_at?: string;
  };
  error?: string;
}

interface CanDeleteResponse {
  can_delete: boolean;
  reason?: string;
  message?: string;
  future_sessions_with_participants?: number;
  active_enrollments_count?: number;
}

export async function deleteMyAccount(): Promise<DeleteAccountResponse> {
  try {
    // Récupérer le token d'authentification
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return {
        success: false,
        message: 'Non authentifié',
        error: 'Token d\'authentification manquant'
      };
    }

    // Appeler l'edge function au lieu du RPC direct
    const { data, error } = await supabase.functions.invoke('delete-account2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      return {
        success: false,
        message: 'Erreur lors de la suppression du compte',
        error: error.message || 'Erreur lors de la suppression du compte'
      };
    }

    const result = data as DeleteAccountResponse;
    
    if (result?.success) {
      // Nettoyer le stockage local seulement en cas de succès
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (storageError) {
        console.warn('Erreur lors du nettoyage du stockage local:', storageError);
      }
    }

    return result || {
      success: false,
      message: 'Réponse invalide',
      error: 'Réponse invalide du serveur'
    };

  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    return {
      success: false,
      message: 'Erreur inattendue',
      error: error instanceof Error ? error.message : "Erreur inattendue"
    };
  }
}

export async function canDeleteAccount(): Promise<CanDeleteResponse> {
  try {
    const { data, error } = await supabase.rpc('can_delete_account');

    if (error) {
      console.error('Error checking deletion eligibility:', error);
      throw error;
    }

    return (data as unknown as CanDeleteResponse) || {
      can_delete: false,
      reason: 'no_data',
      message: 'Aucune donnée reçue'
    };

  } catch (error) {
    console.error('Erreur lors de la vérification:', error);
    return {
      can_delete: false,
      reason: 'verification_failed',
      message: 'Impossible de vérifier l\'éligibilité à la suppression'
    };
  }
}