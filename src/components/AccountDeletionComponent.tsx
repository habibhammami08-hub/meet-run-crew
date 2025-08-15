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


const AccountDeletionComponent: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handler de confirmation de suppression
  const handleConfirmDelete = async () => {
    if (confirmationText !== 'SUPPRIMER') {
      toast({
        title: "Confirmation requise",
        description: "Veuillez taper 'SUPPRIMER' pour confirmer",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeleting(true);

      // Appel edge function (Bearer token inclus automatiquement)
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: {} // pas de payload nécessaire
      });

      if (error) {
        console.error('delete-account error:', error);
        toast({
          title: 'Suppression impossible',
          description: error.message ?? 'Une erreur est survenue.',
          variant: 'destructive',
        });
        return;
      }

      // Invalider la session côté client
      await supabase.auth.signOut();

      toast({
        title: 'Compte supprimé',
        description: 'Votre compte et vos données ont été supprimés.',
      });

      // Redirection au choix (ex: page d'accueil)
      navigate('/', { replace: true });
    } catch (e: any) {
      console.error('Unexpected delete error:', e);
      toast({
        title: 'Erreur',
        description: e?.message ?? 'Une erreur inattendue est survenue.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
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
            onClick={() => setShowConfirmDialog(true)}
            disabled={isDeleting}
            variant="destructive"
            className="w-full transition-sport"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Suppression...
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
              
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 dark:bg-yellow-900/20 dark:border-yellow-800">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                  ⚠️ Toutes vos données seront définitivement supprimées : profil, sessions, inscriptions, fichiers.
                </p>
              </div>

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
              onClick={handleConfirmDelete}
              disabled={isDeleting || confirmationText !== 'SUPPRIMER'}
              className="bg-destructive hover:bg-destructive/90 transition-sport"
            >
              {isDeleting ? (
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