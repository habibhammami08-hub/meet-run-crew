import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, AlertTriangle, XCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { deleteMyAccount, canDeleteAccount } from "@/utils/deleteAccount";
import { logger } from "@/utils/logger";

interface DeletionEligibility {
  can_delete: boolean;
  reason?: string;
  message?: string;
  future_sessions_with_participants?: number;
  active_enrollments_count?: number;
}

const AccountDeletionComponent: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [eligibility, setEligibility] = useState<DeletionEligibility>({
    can_delete: false
  });
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    checkDeletionEligibility();
  }, []);

  const checkDeletionEligibility = async () => {
    setIsChecking(true);
    try {
      const result = await canDeleteAccount();
      setEligibility(result);
      
      if (!result.can_delete && result.reason === 'has_future_sessions_with_participants') {
        toast({
          title: "Suppression impossible",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      logger.error("Error checking deletion eligibility:", error);
      toast({
        title: "Erreur",
        description: "Impossible de vérifier l'éligibilité à la suppression",
        variant: "destructive"
      });
    } finally {
      setIsChecking(false);
    }
  };

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
      
      const result = await deleteMyAccount();
      logger.info("Account deletion result:", result);
      
      if (result.success) {
        const subscriptionMessage = result.subscription_info?.had_active_subscription 
          ? ` Votre abonnement Premium a été programmé pour se terminer le ${new Date(result.subscription_info.expires_at!).toLocaleDateString('fr-FR')}.`
          : '';
          
        toast({ 
          title: "Compte supprimé", 
          description: `Votre compte et vos données ont été supprimés définitivement.${subscriptionMessage}`,
          duration: 5000
        });
        
        setShowConfirmDialog(false);
        
        setTimeout(() => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.replace("/account-deleted");
        }, 2000);
      } else {
        toast({ 
          title: "Erreur", 
          description: result.error || "Suppression impossible", 
          variant: "destructive" 
        });
        logger.error("Account deletion error:", result.error);
        setShowConfirmDialog(false);
      }
    } catch (error: any) {
      logger.error("Account deletion exception:", error);
      toast({ 
        title: "Erreur", 
        description: error?.message || "Suppression impossible", 
        variant: "destructive" 
      });
      setShowConfirmDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenDialog = () => {
    checkDeletionEligibility();
    if (eligibility.can_delete) {
      setShowConfirmDialog(true);
    }
  };

  if (isChecking) {
    return (
      <div className="space-y-4 p-6 border border-muted rounded-lg bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            Vérification de l'éligibilité à la suppression...
          </p>
        </div>
      </div>
    );
  }

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

      {!eligibility.can_delete && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Suppression impossible :</strong> {eligibility.message}
            {eligibility.future_sessions_with_participants && eligibility.future_sessions_with_participants > 0 && (
              <span className="block mt-2">
                Vous organisez {eligibility.future_sessions_with_participants} session(s) à venir avec des participants inscrits. 
                Annulez-les d'abord pour pouvoir supprimer votre compte.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {eligibility.can_delete && eligibility.active_enrollments_count && eligibility.active_enrollments_count > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Attention :</strong> Vous avez {eligibility.active_enrollments_count} inscription(s) 
            active(s) qui seront automatiquement annulée(s).
          </AlertDescription>
        </Alert>
      )}

      {eligibility.can_delete && (
        <div className="space-y-3">
          <h4 className="font-medium">Supprimer définitivement mon compte</h4>
          <p className="text-sm text-muted-foreground">
            Cette action supprimera <strong>définitivement</strong> :
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
            <li>• Votre profil et informations personnelles</li>
            <li>• Toutes vos sessions créées</li>
            <li>• Vos inscriptions aux événements</li>
            <li>• Vos photos et fichiers uploadés</li>
          </ul>

          {/* Affichage spécial pour les utilisateurs avec abonnement - temporairement désactivé */}
          {false && (
            <Alert className="border-orange-200 bg-orange-50">
              <CreditCard className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Abonnement Premium actif détecté</strong>
                <div className="mt-2 space-y-1 text-sm">
                  <p>• Votre abonnement ne sera <strong>pas</strong> remboursé</p>
                  <p>• Le renouvellement automatique sera <strong>annulé</strong></p>
                  <p>• Vous garderez vos avantages jusqu'à la fin de période</p>
                  <p>• Si vous revenez avant cette date, vous pourrez réactiver le renouvellement</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm font-medium text-destructive">
            ⚠️ Cette action est irréversible et ne peut pas être annulée.
          </p>
          <p className="text-xs text-muted-foreground">
            Après suppression, vous ne pourrez pas créer un nouveau compte avec le même email pendant 7 jours.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button 
          variant="outline" 
          size="sm"
          onClick={checkDeletionEligibility}
          disabled={isChecking}
        >
          {isChecking ? "Vérification..." : "Re-vérifier"}
        </Button>
        
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogTrigger asChild>
            <Button 
              variant="destructive" 
              className="flex items-center gap-2"
              disabled={!eligibility.can_delete || isChecking}
              onClick={handleOpenDialog}
            >
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
                
                {/* Affichage des impacts sur l'abonnement - temporairement désactivé */}
                {false && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800 font-medium mb-2">
                      Impact sur votre abonnement Premium :
                    </p>
                    <ul className="text-xs text-orange-700 space-y-1">
                      <li>• Aucun remboursement ne sera effectué</li>
                      <li>• Renouvellement automatique annulé</li>
                      <li>• Avantages conservés jusqu'à la fin de période</li>
                      <li>• Possibilité de réactiver si vous revenez</li>
                    </ul>
                  </div>
                )}
                
                {eligibility.active_enrollments_count && eligibility.active_enrollments_count > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">
                      <strong>Impact :</strong> {eligibility.active_enrollments_count} inscription(s) 
                      active(s) seront automatiquement annulée(s).
                    </p>
                  </div>
                )}
                
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
                    autoComplete="off"
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
                {isDeleting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Suppression en cours...
                  </div>
                ) : (
                  "Supprimer définitivement"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AccountDeletionComponent;