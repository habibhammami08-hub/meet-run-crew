import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MapFallbackProps {
  error: Error;
  retry: () => void;
}

const MapFallback: React.FC<MapFallbackProps> = ({ error, retry }) => {
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed border-muted">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-lg">Erreur de carte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            La carte n'a pas pu se charger correctement. Cela peut être dû à un problème de connexion ou de géolocalisation.
          </p>
          
          <div className="space-y-2">
            <Button 
              onClick={retry}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
            
            <p className="text-xs text-muted-foreground">
              Si le problème persiste, essayez de recharger la page ou vérifiez votre connexion.
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
    </div>
  );
};

interface MapErrorBoundaryProps {
  children: React.ReactNode;
}

export const MapErrorBoundary: React.FC<MapErrorBoundaryProps> = ({ children }) => {
  return (
    <ErrorBoundary fallback={MapFallback}>
      {children}
    </ErrorBoundary>
  );
};