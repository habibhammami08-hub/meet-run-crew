// CORRECTION FINALE pour Profile.tsx - Élimination totale des boucles

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { Profile as DatabaseProfile } from "@/types/database";

// Custom types for this component
type ProfileData = {
  id: string;
  full_name: string | null;
  age: number | null;
  city: string | null;
  avatar_url: string | null;
  sessions_hosted: number;
  sessions_joined: number;
  total_km: number;
};

type SessionData = {
  id: string;
  title: string;
  scheduled_at: string;
  start_place: string;
  distance_km: number;
  intensity: string;
  max_participants: number;
  status: string;
  current_participants: number;
};
import { Trash2, Edit2, Save, X, User, MapPin, Calendar, Users, Target } from "lucide-react";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mySessions, setMySessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Form state...
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const supabase = getSupabase();

  // ✅ SOLUTION: Tout dans des useRef - pas de useCallback !
  const stableFunctions = useRef({
    fetchMySessions: async (userId: string) => {
      if (!supabase || !userId) return;

      try {
        console.log("[Profile] Fetching sessions for user:", userId);
        
        const { data: sessions, error } = await supabase
          .from('sessions')
          .select(`
            id,
            title,
            scheduled_at,
            start_place,
            distance_km,
            intensity,
            max_participants,
            status
          `)
          .eq('host_id', userId)
          .in('status', ['published', 'active'])
          .not('scheduled_at', 'is', null)
          .order('scheduled_at', { ascending: false });

        if (error) {
          console.error('[Profile] Error fetching sessions:', error);
          return;
        }

        if (!sessions) return;

        const sessionsWithCounts = await Promise.all(
          sessions.map(async (session) => {
            try {
              const { count } = await supabase
                .from('enrollments')
                .select('*', { count: 'exact' })
                .eq('session_id', session.id)
                .in('status', ['paid', 'included_by_subscription', 'confirmed']);

              return {
                ...session,
                current_participants: (count || 0) + 1
              };
            } catch (error) {
              console.warn(`[Profile] Error counting participants for session ${session.id}:`, error);
              return {
                ...session,
                current_participants: 1
              };
            }
          })
        );

        console.log("[Profile] Sessions loaded:", sessionsWithCounts.length);
        setMySessions(sessionsWithCounts);
      } catch (error) {
        console.error('[Profile] Error fetching sessions:', error);
      }
    },

    updateProfileStats: async (userId: string) => {
      if (!supabase || !userId) return;

      try {
        console.log("[Profile] Updating profile statistics for user:", userId);
        
        const [{ count: sessionsHosted }, { count: sessionsJoined }] = await Promise.all([
          supabase
            .from('sessions')
            .select('*', { count: 'exact' })
            .eq('host_id', userId)
            .eq('status', 'published'),
          supabase
            .from('enrollments')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .in('status', ['paid', 'included_by_subscription', 'confirmed'])
        ]);

        await supabase
          .from('profiles')
          .update({ 
            sessions_hosted: sessionsHosted || 0,
            sessions_joined: sessionsJoined || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        console.log("[Profile] Stats updated successfully");
      } catch (error) {
        console.error('[Profile] Error updating profile stats:', error);
      }
    },

    loadProfile: async (userId: string) => {
      if (!supabase) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        console.log("[Profile] Loading profile for user:", userId);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
          .eq("id", userId)
          .maybeSingle();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          toast({
            title: "Erreur",
            description: "Impossible de charger le profil",
            variant: "destructive"
          });
        } else if (profileData) {
          console.log("Profile loaded:", profileData);
          setProfile(profileData);
          setFullName(profileData.full_name || "");
          setAge(profileData.age ?? "");
          setCity(profileData.city || "");
          setSportLevel("Occasionnel");
        } else {
          console.log("No profile found, creating one...");
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .upsert({
              id: userId,
              email: user?.email || '',
              full_name: user?.email?.split('@')[0] || 'Runner',
              sessions_hosted: 0,
              sessions_joined: 0,
              total_km: 0
            })
            .select()
            .single();

          if (!createError && newProfile) {
            setProfile(newProfile);
            setFullName(newProfile.full_name || "");
            setAge(newProfile.age ?? "");
            setCity(newProfile.city || "");
            setSportLevel("Occasionnel");
          }
        }

        // ✅ Appeler les fonctions stables directement
        await stableFunctions.current.fetchMySessions(userId);
        await stableFunctions.current.updateProfileStats(userId);

      } catch (error: any) {
        console.error("Error loading profile:", error);
        toast({
          title: "Erreur",
          description: "Une erreur est survenue lors du chargement",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    }
  });

  // ✅ Fonction de suppression simplifiée utilisant stableFunctions
  const handleDeleteSession = async (sessionId: string) => {
    if (!supabase || !user?.id) return;

    setDeletingSession(sessionId);
    try {
      console.log("[Profile] Deleting session:", sessionId);
      
      const { error: sessionError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .eq('host_id', user.id);

      if (sessionError) {
        throw sessionError;
      }

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès."
      });

      // ✅ Utiliser la fonction stable
      await stableFunctions.current.fetchMySessions(user.id);
      
    } catch (error: any) {
      console.error('[Profile] Delete error:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la session: " + error.message,
        variant: "destructive"
      });
    } finally {
      setDeletingSession(null);
    }
  };

  // ✅ EFFET PRINCIPAL - AUCUNE dépendance de fonction !
  useEffect(() => {
    if (user === null) {
      navigate('/auth?returnTo=/profile');
      return;
    }
    
    if (user === undefined) {
      return; // Encore en cours de chargement auth
    }
    
    // Charger le profil seulement si on n'en a pas et qu'on n'est pas en cours de chargement
    if (user && !profile && !loading) {
      stableFunctions.current.loadProfile(user.id); // ✅ Fonction stable !
    }
  }, [user, navigate, profile, loading]); // ✅ Aucune fonction dans les dépendances !

  // ✅ Event listener pour les mises à jour externes
  useEffect(() => {
    if (!user?.id) return;

    const handleProfileRefresh = (event: any) => {
      if (event.detail?.userId === user.id) {
        console.log("[Profile] External refresh triggered");
        stableFunctions.current.fetchMySessions(user.id);
        stableFunctions.current.updateProfileStats(user.id);
      }
    };

    window.addEventListener('profileRefresh', handleProfileRefresh);
    return () => window.removeEventListener('profileRefresh', handleProfileRefresh);
  }, [user?.id]); // ✅ Seulement user.id

  // ✅ Fonction de sauvegarde normale (pas dans useCallback)
  async function handleSave() {
    if (!supabase || !profile || !user?.id) return;
    
    setSaving(true);
    try {
      let avatarUrl = profile.avatar_url || null;

      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.id}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });

        if (uploadError) {
          toast({
            title: "Erreur",
            description: "Erreur upload image : " + uploadError.message,
            variant: "destructive"
          });
          return;
        }

        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = pub.publicUrl;
      }

      const ageValue = age === "" ? null : Number(age);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          age: ageValue,
          city: city,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (error) {
        toast({
          title: "Erreur",
          description: "Erreur de sauvegarde: " + error.message,
          variant: "destructive"
        });
        return;
      }

      setProfile(prev => prev ? {
        ...prev,
        full_name: fullName,
        age: ageValue,
        city: city,
        avatar_url: avatarUrl
      } : null);

      setEditing(false);
      setAvatarFile(null);
      
      toast({
        title: "Profil mis à jour",
        description: "Vos modifications ont été sauvegardées."
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue: " + error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  // États de chargement inchangés...
  if (user === null) return null;
  if (user === undefined) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p>Vérification de votre authentification...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p>Chargement du profil...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">
          <p>Impossible de charger le profil</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // JSX reste identique...
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Le JSX complet reste identique à ton code */}
      {/* ... */}
    </div>
  );
}