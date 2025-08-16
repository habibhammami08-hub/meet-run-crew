import { useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AccountDeletionComponent from "@/components/AccountDeletionComponent";

interface ProfileStats {
  sessions_hosted: number;
  sessions_joined: number;
  total_km: number;
  total_distance_hosted_km: number;
  full_name: string;
  email: string;
}

export default function Profile() {
  const supabase = getSupabase();
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfileStats() {
      if (!supabase || !user) return;
      
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("sessions_hosted, sessions_joined, total_km, total_distance_hosted_km, full_name, email")
          .eq("id", user.id)
          .single();
        
        if (error) {
          console.error("[profile] fetch error", error);
          return;
        }
        
        console.info("[profile] stats loaded:", data);
        setStats(data);
      } catch (e) {
        console.error("[profile] load error", e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchProfileStats();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Accès restreint</h2>
          <p className="text-muted-foreground">
            Veuillez vous connecter pour accéder à votre profil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="grid gap-6">
        {/* En-tête profil */}
        <div className="rounded-2xl border p-6">
          <h1 className="text-2xl font-bold mb-2">Mon Profil</h1>
          <p className="text-muted-foreground">{user.email}</p>
          {stats?.full_name && (
            <p className="text-sm font-medium">{stats.full_name}</p>
          )}
        </div>

        {/* Statistiques */}
        <div className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold mb-4">Mes statistiques</h2>
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Chargement des statistiques...</p>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-xl bg-blue-50">
                <div className="text-2xl font-bold text-blue-600">{stats.sessions_hosted || 0}</div>
                <div className="text-sm text-blue-600">Sessions organisées</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-green-50">
                <div className="text-2xl font-bold text-green-600">{stats.sessions_joined || 0}</div>
                <div className="text-sm text-green-600">Sessions rejointes</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-purple-50">
                <div className="text-2xl font-bold text-purple-600">{(stats.total_km || 0).toFixed(1)}km</div>
                <div className="text-sm text-purple-600">Distance parcourue</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-orange-50">
                <div className="text-2xl font-bold text-orange-600">{(stats.total_distance_hosted_km || 0).toFixed(1)}km</div>
                <div className="text-sm text-orange-600">Distance organisée</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Impossible de charger les statistiques</p>
            </div>
          )}
        </div>

        {/* Actions de gestion compte */}
        <div className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold mb-4">Gestion du compte</h2>
          <AccountDeletionComponent />
        </div>
      </div>
    </div>
  );
}