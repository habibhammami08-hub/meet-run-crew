import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AccountDeleted = () => {
  const navigate = useNavigate();

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
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center shadow-lg">
        <CardContent className="p-8 space-y-6">
          <div className="flex justify-center">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Compte supprimé
            </h1>
            <p className="text-muted-foreground">
              Votre compte a été supprimé avec succès. Merci d'avoir utilisé MeetRun 🏃‍♂️
            </p>
          </div>

          <Button 
            onClick={handleReturnHome}
            className="w-full"
            size="lg"
          >
            Retour à l'accueil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountDeleted;