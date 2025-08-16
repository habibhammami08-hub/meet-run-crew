import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { User, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileFallbackProps {
  error: Error;
  retry: () => void;
}

const ProfileFallback: React.FC<ProfileFallbackProps> = ({ error, retry }) => {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <div className="relative">
            <User className="h-12 w-12 text-muted-foreground" />
            <AlertTriangle className="h-6 w-6 text-destructive absolute -top-1 -right-1" />
          </div>
        </div>
        <CardTitle className="text-lg">Erreur de profil</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Une erreur s'est produite lors du chargement des informations de profil.
        </p>
        
        <div className="space-y-2">
          <Button 
            onClick={retry}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Recharger le profil
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Si le problème persiste, essayez de vous déconnecter puis reconnecter.
          </p>
        </div>

        {import.meta.env.DEV && (
          <details className="text-left">
            <summary className="text-xs cursor-pointer">Détails de l'erreur</summary>
            <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

interface ProfileErrorBoundaryProps {
  children: React.ReactNode;
}

export const ProfileErrorBoundary: React.FC<ProfileErrorBoundaryProps> = ({ children }) => {
  return (
    <ErrorBoundary fallback={ProfileFallback}>
      {children}
    </ErrorBoundary>
  );
};