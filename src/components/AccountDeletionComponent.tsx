import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const AccountDeletionComponent: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Handler de confirmation de suppression
  const handleConfirmDelete = async () => {
    if (confirmationText !== 'SUPPRIMER') {
      toast({ 
        title: "Confirmation requise", 
        description: "Veuillez taper 'SUPPRIMER' pour confirmer", 
        variant: "destructive" 
      });
      return;
    }

    if (!user) {
      toast({ 
        title: "Erreur", 
        description: "Utilisateur non connecté", 
        variant: "destructive" 
      });
      return;
    }

    try {
      setIsDeleting(true);
      // Marquer qu'on est en suppression pour éviter la recréation de profil
      localStorage.setItem('deletion_in_progress', 'true');
      console.log("[account-deletion] Début suppression utilisateur:", user.id);

      // === A. ESSAYER L'EDGE FUNCTION EN PREMIER ===
      try {
        console.log("[account-deletion] Tentative Edge Function...");
        
        const { data, error } = await supabase.functions.invoke('delete-account', {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        });

        // Erreur transport/réseau
        if (error) {
          throw new Error(`Edge Function transport error: ${error.message}`);
        }

        // Vérifier la réponse API
        if (!data?.ok) {
          throw new Error(`Edge Function API error - Stage: ${data?.stage || 'unknown'} - ${data?.error || 'Unknown error'}`);
        }

        // === SUCCÈS EDGE FUNCTION ===
        console.log("[account-deletion] Edge Function réussie:", data);
        
        toast({
          title: "Compte supprimé",
          description: "Votre compte et toutes vos données ont été supprimés avec succès.",
          variant: "default",
        });

        // Déconnexion puis redirection hard
        await supabase.auth.signOut({ scope: 'global' });
        // Nettoyer TOUT l'état local
        localStorage.clear();
        sessionStorage.clear();
        // Nettoyer aussi les cookies de session s'il y en a
        document.cookie.split(";").forEach(c => { 
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;"); 
        });
        window.location.replace('/goodbye');
        return;

      } catch (edgeFunctionError: any) {
        console.error("[account-deletion] Edge Function échouée:", edgeFunctionError);
        
        // Afficher l'erreur de l'Edge Function
        toast({
          title: "Erreur Edge Function",
          description: edgeFunctionError.message || "Erreur inconnue",
          variant: "destructive",
        });

        // === B. FALLBACK RPC SQL ===
        console.log("[account-deletion] Tentative fallback RPC...");
        
        try {
          const { data: sqlResult, error: sqlError } = await supabase.rpc('delete_user_completely', { 
            p_user_id: user.id 
          });
          
          if (sqlError) {
            throw new Error(`SQL RPC error: ${sqlError.message}`);
          }

          if ((sqlResult as any)?.ok) {
            console.log("[account-deletion] Fallback RPC réussi:", sqlResult);
            
            toast({
              title: "Compte supprimé (SQL)",
              description: "Vos données ont été supprimées via la fonction de fallback.",
              variant: "default",
            });

            // Déconnexion puis redirection hard
            await supabase.auth.signOut({ scope: 'global' });
            // Nettoyer l'état local
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/goodbye');
            return;

          } else {
            throw new Error("SQL function returned non-ok result");
          }

        } catch (sqlError: any) {
          console.error("[account-deletion] Fallback RPC échoué:", sqlError);
          
          toast({
            title: "Échec de suppression",
            description: `Edge Function ET fallback SQL ont échoué. Contactez le support.`,
            variant: "destructive",
          });
        }
      }

    } catch (globalError: any) {
      console.error("[account-deletion] Erreur globale:", globalError);
      toast({
        title: "Erreur critique",
        description: "Une erreur inattendue s'est produite. Contactez le support.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowConfirmDialog(false);
      setConfirmationText('');
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