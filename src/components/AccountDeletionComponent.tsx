import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { deleteMyAccount } from "@/utils/deleteAccount";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";

const AccountDeletionComponent: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleConfirmDelete = async () => {
    if (confirmationText !== 'SUPPRIMER') {
      toast({
        title: "Confirmation requise",
        description: "Veuillez taper exactement 'SUPPRIMER' pour confirmer",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsDeleting(true);
      logger.info("Début du processus de suppression de compte...");
      
      const res = await deleteMyAccount();
      logger.info("Résultat de la suppression:", res);
      
      if (res.ok) {
        // Afficher le message de succès
        toast({ 
          title: "Compte supprimé avec succès", 
          description: "Votre compte et toutes vos données ont été supprimés définitivement. Au revoir 👋" 
        });
        
        // Fermer le dialog
        setShowConfirmDialog(false);
        
        // Déconnexion explicite via useAuth pour nettoyer l'état React
        try {
          await signOut();
        } catch (signOutError) {
          console.warn("SignOut error (non-fatal):", signOutError);
        }
        
        // Redirection immédiate vers la page d'accueil
        setTimeout(() => {
          navigate("/", { replace: true });
          // Force un reload pour s'assurer que tout l'état est nettoyé
          window.location.reload();
        }, 1500);
      } else {
        // Gestion des erreurs avec codes spécifiques
        const errorMessage = res.error || "Une erreur inconnue est survenue";
        
        toast({ 
          title: "Erreur de suppression", 
          description: errorMessage,
          variant: "destructive" 
        });
        
        logger.error("Erreur de suppression de compte:", res.error);
        setShowConfirmDialog(false);
      }
    } catch (e: any) {
      logger.error("Exception lors de la suppression:", e);
      
      const errorMsg = e?.message || "Une erreur technique est survenue";
      toast({ 
        title: "Erreur technique", 
        description: `${errorMsg}. Veuillez réessayer ou contacter le support.`,
        variant: "destructive" 
      });
      
      setShowConfirmDialog(false);
    } finally {
      setIsDeleting(false);
      setConfirmationText(''); // Reset le champ de confirmation
    }
  };

  return (
    <div className="space-y-4 p-6 border border-destructive/20 rounded-lg bg-destructive/5">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <div>
          <h3 className="text-lg font-semibold text-destructive">Zone dangereuse</h3>
          <p className="text-sm text-muted-foreground">
            Actions irréversibles de suppression de compte
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">Supprimer définitivement mon compte</h4>
        <p className="text-sm text-muted-foreground">
          Cette action supprimera <strong>définitivement</strong> :
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 ml-4">
          <li>• Votre profil et informations personnelles</li>
          <li>• Toutes vos sessions créées</li>
          <li>• Vos inscriptions aux événements</li>
          <li>• Vos abonnements et données de paiement</li>
          <li>• Vos photos et fichiers uploadés</li>
        </ul>
        <p className="text-sm font-medium text-destructive">
          ⚠️ Cette action est irréversible et ne peut pas être annulée.
        </p>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="flex items-center gap-2">
            <Trash2 size={16} />
            Supprimer mon compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={20} />
              Confirmer la suppression du compte
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Vous êtes sur le point de supprimer définitivement votre compte MeetRun.
              </p>
              <p className="font-medium text-destructive">
                Cette action est irréversible et supprimera toutes vos données.
              </p>
              <div>
                <Label htmlFor="confirmation" className="text-sm font-medium">
                  Pour confirmer, tapez <strong>SUPPRIMER</strong> ci-dessous :
                </Label>
                <Input
                  id="confirmation"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Tapez SUPPRIMER"
                  className="mt-2"
                  disabled={isDeleting}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={confirmationText !== 'SUPPRIMER' || isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Suppression..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountDeletionComponent;