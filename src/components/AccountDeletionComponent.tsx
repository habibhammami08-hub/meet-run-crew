import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface DeletionInfo {
  can_delete: boolean;
  reason: string;
  future_sessions_count?: number;
  active_enrollments_count?: number;
  message: string;
}

const AccountDeletionComponent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [deletionInfo, setDeletionInfo] = useState<DeletionInfo | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Vérifier si l'utilisateur peut supprimer son compte
  const checkDeletionEligibility = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('can_delete_account');
      
      if (error) {
        console.error('Error checking deletion eligibility:', error);
        toast({
          title: "Erreur",
          description: "Impossible de vérifier l'éligibilité de suppression",
          variant: "destructive",
        });
        return;
      }

      if (data && typeof data === 'object' && 'can_delete' in data) {
        setDeletionInfo(data as unknown as DeletionInfo);
        
        if (data.can_delete) {
          setShowConfirmDialog(true);
        } else {
          toast({
            title: "Suppression impossible",
            description: (data as unknown as DeletionInfo).message || "Suppression non autorisée",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Erreur",
          description: "Réponse inattendue du serveur",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Erreur",
        description: "Une erreur inattendue s'est produite",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Supprimer définitivement le compte
  const deleteAccount = async () => {
    if (confirmationText !== 'SUPPRIMER') {
      toast({
        title: "Confirmation requise",
        description: "Veuillez taper 'SUPPRIMER' pour confirmer",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Appeler l'Edge Function pour suppression complète
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });

      if (error) {
        console.error('Error deleting account:', error);
        toast({
          title: "Erreur de suppression",
          description: error.message || "Impossible de supprimer le compte",
          variant: "destructive",
        });
        return;
      }

      // Succès - déconnecter l'utilisateur et rediriger
      toast({
        title: "Compte supprimé",
        description: "Votre compte a été supprimé avec succès",
      });

      // Déconnexion forcée
      await supabase.auth.signOut();
      
      // Redirection vers la page d'accueil
      navigate('/', { replace: true });

    } catch (error) {
      console.error('Unexpected error during deletion:', error);
      toast({
        title: "Erreur",
        description: "Une erreur inattendue s'est produite lors de la suppression",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
      setConfirmationText('');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card border">
      <div className="text-center mb-6">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Supprimer mon compte
        </h2>
        <p className="text-muted-foreground">
          Cette action est irréversible. Toutes vos données seront définitivement supprimées.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <h3 className="font-semibold text-destructive mb-2">
            Qu'est-ce qui sera supprimé :
          </h3>
          <ul className="text-sm text-destructive/80 space-y-1">
            <li>• Votre profil et informations personnelles</li>
            <li>• Vos inscriptions à des sessions futures (annulées)</li>
            <li>• Vos sessions passées (archivées)</li>
            <li>• Vos données de paiement et d'abonnement</li>
            <li>• Votre accès à l'application</li>
          </ul>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 dark:bg-yellow-900/20 dark:border-yellow-800">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
            Important :
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Vous ne pourrez pas supprimer votre compte si vous organisez des sessions à venir. 
            Annulez-les d'abord ou attendez qu'elles se terminent.
          </p>
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogTrigger asChild>
          <Button
            onClick={checkDeletionEligibility}
            disabled={isLoading}
            variant="destructive"
            className="w-full transition-sport"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Vérification...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer définitivement mon compte
              </>
            )}
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-destructive">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Confirmation de suppression
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Cette action est <strong>irréversible</strong>. Votre compte et toutes vos données 
                seront définitivement supprimés.
              </p>
              
              {deletionInfo?.active_enrollments_count && deletionInfo.active_enrollments_count > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 dark:bg-yellow-900/20 dark:border-yellow-800">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                    ⚠️ Vous avez {deletionInfo.active_enrollments_count} inscription(s) active(s) 
                    qui seront automatiquement annulée(s).
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Pour confirmer, tapez <code className="bg-muted px-1 rounded">SUPPRIMER</code> :
                </label>
                <Input
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Tapez SUPPRIMER"
                  className="text-center font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setConfirmationText('');
                setShowConfirmDialog(false);
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAccount}
              disabled={isLoading || confirmationText !== 'SUPPRIMER'}
              className="bg-destructive hover:bg-destructive/90 transition-sport"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer définitivement'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-4 text-center">
        <p className="text-xs text-muted-foreground">
          Besoin d'aide ? Contactez notre support avant de supprimer votre compte.
        </p>
      </div>
    </div>
  );
};

export default AccountDeletionComponent;