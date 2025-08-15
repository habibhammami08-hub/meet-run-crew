import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

const Goodbye = () => {
  // Nettoyer complètement l'auth au chargement de cette page
  useEffect(() => {
    // Nettoyer le localStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Nettoyer l'URL de fragments OAuth
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleReturnHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle className="w-16 h-16 text-green-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Compte supprimé avec succès
          </h1>
          <p className="text-muted-foreground">
            Votre compte et toutes vos données ont été définitivement supprimés de MeetRun.
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <p>
            Merci d'avoir utilisé MeetRun. Nous espérons vous revoir bientôt !
          </p>
        </div>

        <Button 
          onClick={handleReturnHome}
          className="w-full"
          size="lg"
        >
          Retour à l'accueil
        </Button>
      </div>
    </div>
  );
};

export default Goodbye;