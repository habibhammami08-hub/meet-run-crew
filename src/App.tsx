import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import { useServiceWorker } from "./hooks/useServiceWorker";
import './i18n';

// Lazy load pages for better performance
const Home = lazy(() => import("./pages/Home"));
const Map = lazy(() => import("./pages/Map"));
const SessionDetails = lazy(() => import("./pages/SessionDetails"));
const CreateRun = lazy(() => import("./pages/CreateRun"));
const Profile = lazy(() => import("./pages/Profile"));
const Auth = lazy(() => import("./pages/Auth"));
const Subscription = lazy(() => import("./pages/Subscription"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCancel = lazy(() => import("./pages/SubscriptionCancel"));
const Goodbye = lazy(() => import("./pages/Goodbye"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading component
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const App = () => {
  // Initialize Service Worker
  const { isUpdateAvailable, update } = useServiceWorker();
  
  // Initialize mobile foundations
  useEffect(() => {
    // Initialize deep links
    import('@/core/deeplinks').then(({ deepLinks, registerCommonHandlers }) => {
      deepLinks.initialize();
      
      // Register common handlers with router navigation
      const navigate = (path: string) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      };
      
      registerCommonHandlers(navigate);
    });
  }, []);

  // Handle service worker updates
  useEffect(() => {
    if (isUpdateAvailable) {
      console.log('🔄 App update available');
      // Auto-update after 3 seconds or user can manually update
      const timer = setTimeout(() => {
        update();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isUpdateAvailable, update]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppLayout>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
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
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
