import React from 'react';
import { AlertTriangle, Settings, RefreshCw, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface EnvironmentFallbackProps {
  missingVars: string[];
}

export const EnvironmentFallback: React.FC<EnvironmentFallbackProps> = ({ missingVars }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const envTemplate = `# Add these variables to Lovable Settings → Environment Variables
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_public_key_here
VITE_SITE_URL=https://your-domain.com
VITE_STRIPE_BUY_BUTTON_ID=buy_btn_your_stripe_buy_button_id_here`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AlertTriangle className="h-16 w-16 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Variables d'environnement manquantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              L'application ne peut pas démarrer car des variables d'environnement requises sont manquantes.
            </p>
            
            <div className="bg-muted p-4 rounded-md mb-4">
              <h4 className="font-semibold mb-2">Variables manquantes :</h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {missingVars.map(varName => (
                  <Badge key={varName} variant="destructive">{varName}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-md">
              <h4 className="flex items-center gap-2 font-semibold text-blue-900 mb-2">
                <Settings className="h-4 w-4" />
                Comment résoudre ce problème
              </h4>
              <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                <li>Allez dans <strong>Settings → Environment Variables</strong> de votre projet Lovable</li>
                <li>Ajoutez les variables manquantes avec leurs valeurs correctes</li>
                <li>Sauvegardez les modifications</li>
                <li>Relancez le build de l'application</li>
              </ol>
            </div>

            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Template des variables :</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(envTemplate)}
                  className="flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  Copier
                </Button>
              </div>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto">
                {envTemplate}
              </pre>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md">
              <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Points importants :</h4>
              <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                <li>Les variables DOIVENT commencer par <code>VITE_</code> pour être accessibles côté frontend</li>
                <li>Ne jamais exposer de clés secrètes (service role key) côté frontend</li>
                <li>Vérifiez que vous utilisez les bonnes URLs et clés de votre projet Supabase</li>
                <li>Un redéploiement peut être nécessaire après l'ajout des variables</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-center">
            <Button 
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger l'application
            </Button>
          </div>

          {import.meta.env.DEV && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">Debug Info (développement)</summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto">
                {JSON.stringify({
                  mode: import.meta.env.MODE,
                  dev: import.meta.env.DEV,
                  prod: import.meta.env.PROD,
                  allViteVars: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')),
                  timestamp: new Date().toISOString()
                }, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
};