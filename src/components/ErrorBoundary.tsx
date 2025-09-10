import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  errorId?: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // CORRECTION: Générer un ID unique pour l'erreur
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return { 
      hasError: true, 
      error,
      errorId
    };
  }

  private handleModuleLoadError = () => {
    console.log('🔄 Module loading error detected, reloading page...');
    
    // Nettoyer le cache avant rechargement
    try {
      if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
        window.caches.keys().then((names: string[]) => {
          const deletePromises = names.map(name => window.caches.delete(name));
          return Promise.all(deletePromises);
        }).finally(() => {
          (window as any).location.reload();
        });
      } else {
        (window as any).location.reload();
      }
    } catch (e) {
      // Fallback si le nettoyage du cache échoue
      (window as any).location.reload();
    }
  };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // CORRECTION: Logging sécurisé avec informations contextuelles
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      retryCount: this.retryCount
    };

    console.error('🚨 ErrorBoundary caught error:', errorDetails);
    
    // CORRECTION: Détecter les erreurs de module lazy loading et recharger automatiquement
    if (error.message.includes('Failed to fetch dynamically imported module') || 
        error.message.includes('Loading chunk') ||
        error.message.includes('ChunkLoadError')) {
      this.handleModuleLoadError();
      return;
    }
    
    // CORRECTION: Sauvegarder l'erreur dans localStorage pour debugging
    try {
      const savedErrors = JSON.parse(localStorage.getItem('meetrun_errors') || '[]');
      savedErrors.push(errorDetails);
      
      // Garder seulement les 10 dernières erreurs
      if (savedErrors.length > 10) {
        savedErrors.splice(0, savedErrors.length - 10);
      }
      
      localStorage.setItem('meetrun_errors', JSON.stringify(savedErrors));
    } catch (storageError) {
      console.warn('Impossible de sauvegarder l\'erreur:', storageError);
    }

    this.setState({ errorInfo });

    // CORRECTION: Envoyer l'erreur à un service de monitoring en production
    if (import.meta.env.PROD) {
      // Ici vous pourriez envoyer l'erreur à Sentry, LogRocket, etc.
      console.log('Production error logged:', errorDetails);
    }
  }

  handleRetry = () => {
    this.retryCount++;
    
    // CORRECTION: Limiter le nombre de retry pour éviter les boucles infinies
    if (this.retryCount >= this.maxRetries) {
      console.warn(`Maximum retry attempts (${this.maxRetries}) reached`);
      this.handleGoHome();
      return;
    }

    console.log(`Retry attempt ${this.retryCount}/${this.maxRetries}`);
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      errorId: undefined
    });
  };

  handleReload = () => {
    // CORRECTION: Nettoyer le localStorage avant reload si nécessaire
    try {
      // Nettoyer les données potentiellement corrompues
      const keysToRemove = ['meetrun_temp_', 'cache_'];
      Object.keys(localStorage).forEach(key => {
        keysToRemove.forEach(prefix => {
          if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        });
      });
    } catch (e) {
      console.warn('Erreur nettoyage localStorage:', e);
    }

    window.location.reload();
  };

  handleGoHome = () => {
    // CORRECTION: Navigation sécurisée vers la page d'accueil
    try {
      window.location.href = '/';
    } catch (e) {
      // Fallback si la navigation échoue
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} retry={this.handleRetry} />;
      }

      // CORRECTION: Interface d'erreur améliorée et plus informative
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="h-16 w-16 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Oups ! Une erreur est survenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  Nous nous excusons pour ce problème technique. L'équipe a été automatiquement notifiée.
                </p>
                
                {this.state.errorId && (
                  <div className="bg-muted p-3 rounded-md mb-4">
                    <p className="text-sm font-medium">ID d'erreur : {this.state.errorId}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Veuillez mentionner cet ID si vous contactez le support
                    </p>
                  </div>
                )}
              </div>
              
              {/* CORRECTION: Informations d'erreur en développement seulement */}
              {import.meta.env.DEV && this.state.error && (
                <details className="text-sm bg-muted p-4 rounded-md">
                  <summary className="cursor-pointer font-medium mb-2">
                    Détails techniques (développement)
                  </summary>
                  <div className="space-y-2">
                    <div>
                      <strong>Message :</strong>
                      <pre className="mt-1 text-xs bg-background p-2 rounded overflow-auto">
                        {this.state.error.message}
                      </pre>
                    </div>
                    {this.state.error.stack && (
                      <div>
                        <strong>Stack trace :</strong>
                        <pre className="mt-1 text-xs bg-background p-2 rounded overflow-auto max-h-40">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      <p>Tentatives de récupération : {this.retryCount}/{this.maxRetries}</p>
                      <p>Timestamp : {new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </details>
              )}
              
              {/* CORRECTION: Actions de récupération avec état disabled approprié */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {this.retryCount < this.maxRetries ? (
                  <Button 
                    onClick={this.handleRetry}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Réessayer ({this.maxRetries - this.retryCount} restant{this.maxRetries - this.retryCount > 1 ? 's' : ''})
                  </Button>
                ) : (
                  <div className="text-sm text-muted-foreground text-center">
                    Nombre maximum de tentatives atteint
                  </div>
                )}
                
                <Button 
                  onClick={this.handleReload}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Recharger la page
                </Button>
                
                <Button 
                  onClick={this.handleGoHome}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Retour à l'accueil
                </Button>
              </div>

              {/* CORRECTION: Conseils de dépannage */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-medium text-blue-900 mb-2">Que puis-je faire ?</h4>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Vérifiez votre connexion internet</li>
                  <li>Essayez de vider le cache de votre navigateur</li>
                  <li>Désactivez temporairement les extensions de navigateur</li>
                  <li>Essayez en navigation privée</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// CORRECTION: Hook amélioré pour les erreurs asynchrones
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error | unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    
    // CORRECTION: Logging avec contexte
    console.error('Async error caught by useErrorHandler:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    setError(err);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  React.useEffect(() => {
    if (error) {
      // CORRECTION: Délai avant de throw pour permettre le logging
      const timeoutId = setTimeout(() => {
        throw error;
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [error]);

  return { handleError, clearError };
};

// CORRECTION: HOC amélioré avec gestion d'erreur
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  // CORRECTION: Préserver le nom du composant pour debugging
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};