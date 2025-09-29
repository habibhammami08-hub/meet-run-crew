// src/App.tsx
import { Suspense, lazy, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ENV_READY } from "@/integrations/supabase/client";
import { EnvironmentFallback } from "@/components/EnvironmentFallback";
import AppLayout from "./components/AppLayout";
import GoogleMapProvider from "@/components/Map/GoogleMapProvider";

// Lazy loader avec retry
const createRetryLazy = (importFn: () => Promise<any>, componentName: string) =>
  lazy(() =>
    importFn().catch((error) => {
      console.error(`Failed to load ${componentName}:`, error);
      if (
        error.message?.includes("Failed to fetch dynamically imported module") ||
        error.message?.includes("Loading chunk") ||
        error.name === "ChunkLoadError"
      ) {
        console.log(`🔄 Chunk load error for ${componentName}, reloading...`);
        window.location.reload();
      }
      throw error;
    })
  );

const Home = createRetryLazy(() => import("./pages/Home"), "Home");
const Map = createRetryLazy(() => import("./pages/Map"), "Map");
const SessionDetails = createRetryLazy(() => import("./pages/SessionDetails"), "SessionDetails");
const CreateRun = createRetryLazy(() => import("./pages/CreateRun"), "CreateRun");
const Profile = createRetryLazy(() => import("./pages/Profile"), "Profile");
const Auth = createRetryLazy(() => import("./pages/Auth"), "Auth");
const Subscription = createRetryLazy(() => import("./pages/Subscription"), "Subscription");
const SubscriptionSuccess = createRetryLazy(() => import("./pages/SubscriptionSuccess"), "SubscriptionSuccess");
const SubscriptionCancel = createRetryLazy(() => import("./pages/SubscriptionCancel"), "SubscriptionCancel");
const Goodbye = createRetryLazy(() => import("./pages/Goodbye"), "Goodbye");
const AccountDeleted = createRetryLazy(() => import("./pages/AccountDeleted"), "AccountDeleted");
const NotFound = createRetryLazy(() => import("./pages/NotFound"), "NotFound");

// Spinner simple
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

// --- Arbre de l'app qui dépend du contexte Auth ---
function AppRoutes() {
  const { ready, profile } = useAuth();

  // 1) Attendre que la session + profil soient hydratés
  if (!ready) return <LoadingSpinner />;

  // 2) Remonter les routes dès que l’abo change (ou que le profil est mis à jour)
  const routesKey = useMemo(() => {
    const status = profile?.sub_status ?? "none";
    const end = profile?.sub_current_period_end ?? "none";
    const updated = profile?.updated_at ?? "0";
    return `${status}-${end}-${updated}`;
  }, [profile?.sub_status, profile?.sub_current_period_end, profile?.updated_at]);

  return (
    <AppLayout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes key={routesKey}>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/map" element={<Map />} />
          <Route path="/session/:id" element={<SessionDetails />} />
          <Route path="/create" element={<CreateRun />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/subscription" element={<Subscription />} />
          <Route path="/subscription/success" element={<SubscriptionSuccess />} />
          <Route path="/subscription/cancel" element={<SubscriptionCancel />} />
          <Route path="/goodbye" element={<Goodbye />} />
          <Route path="/account-deleted" element={<AccountDeleted />} />
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

const App = () => {
  // Si les variables d'env ne sont pas prêtes, afficher l'aide
  if (!ENV_READY) {
    const missingVars: string[] = [];
    if (!import.meta.env.VITE_SUPABASE_URL) missingVars.push("VITE_SUPABASE_URL");
    if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missingVars.push("VITE_SUPABASE_ANON_KEY");
    return <EnvironmentFallback missingVars={missingVars} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <GoogleMapProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </GoogleMapProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
