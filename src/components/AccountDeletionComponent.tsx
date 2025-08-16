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

const AccountDeletionComponent: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

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
      logger.info("Starting account deletion process...");
      
      const res = await deleteMyAccount();
      logger.info("Account deletion result:", res);
      
      if (res.ok) {
        toast({ 
          title: "Compte supprimé", 
          description: "Votre compte et vos données ont été supprimés." 
        });
        // Fermer le dialog avant la redirection pour éviter les problèmes d'accessibilité
        setShowConfirmDialog(false);
        setTimeout(() => {
          window.location.replace("/account-deleted");
        }, 1000);
      } else {
        toast({ 
          title: "Erreur", 
          description: res.error || "Suppression impossible", 
          variant: "destructive" 
        });
        logger.error("Account deletion error:", res.error);
        setShowConfirmDialog(false);
      }
    } catch (e: any) {
      logger.error("Account deletion exception:", e);
      toast({ 
        title: "Erreur", 
        description: e?.message || "Suppression impossible", 
        variant: "destructive" 
      });
      setShowConfirmDialog(false);
    } finally {
      setIsDeleting(false);
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