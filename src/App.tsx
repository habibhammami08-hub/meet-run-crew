// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ENV_READY } from "@/integrations/supabase/client";

// Pages (adapte si besoin)
import MapPage from "@/pages/Map";
import Subscription from "@/pages/Subscription";
import SessionDetails from "@/pages/SessionDetails";
// import Profile from "@/pages/Profile"; // si tu l'as

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { ready, user } = useAuth();
  const location = useLocation();

  if (!ready) return <FullPageSpinner />;
  if (!user) {
    const ret = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${ret}`} replace />;
  }
  return children;
}

export default function App() {
  if (!ENV_READY) {
    return (
      <div className="p-6 text-red-700">
        Environnement Supabase non configuré. Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/session/:id" element={<SessionDetails />} />
            {/* <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} /> */}
            {/* Auth route gérée ailleurs */}
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
