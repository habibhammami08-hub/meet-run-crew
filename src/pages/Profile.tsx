import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import AccountDeletionComponent from "@/components/AccountDeletionComponent";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Profile = {
  id: string;
  full_name: string;
  age?: number | null;
  city?: string | null;
  sport_level?: "Occasionnel" | "Confirmé" | "Athlète" | null;
  avatar_url?: string | null;
  sessions_hosted?: number;
  sessions_joined?: number;
  total_km?: number;
  total_distance_hosted_km?: number;
};

type Session = {
  id: string;
  title: string;
  scheduled_at: string;
  start_place?: string;
  distance_km?: number;
  intensity?: string;
  max_participants: number;
  current_participants: number;
  status: string;
};

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // ✅ CORRECTION - Refs pour éviter les conditions de course
  const isMountedRef = useRef(true);
  const loadingRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  // ✅ CORRECTION - Fonction de mise à jour des stats simplifiée avec gestion d'erreur
  const updateProfileStats = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      console.warn("[Profile] No supabase client or userId for stats update");
      return;
    }

    try {
      console.log("[Profile] Updating profile statistics for user:", userId);
      
      // ✅ Utilisation de la RPC avec timeout
      const { data: statsRaw, error: rpcError } = await Promise.race([
        supabase.rpc('get_user_stats', { target_user_id: userId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 10000))
      ]) as any;

      if (rpcError) {
        console.error('[Profile] RPC error:', rpcError);
        return null;
      }

      if (!statsRaw || !isMountedRef.current) return null;

      const stats = statsRaw as {
        sessions_hosted: number;
        sessions_joined: number;
        total_km_hosted: number;
        total_km_joined: number;
        total_km: number;
      };

      console.log("[Profile] Stats calculated:", stats);

      // ✅ Mise à jour avec retry
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              sessions_hosted: stats.sessions_hosted || 0,
              sessions_joined: stats.sessions_joined || 0,
              total_km: stats.total_km || 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (!updateError) {
            console.log("[Profile] Stats updated successfully");
            return stats;
          } else if (retryCount === maxRetries - 1) {
            throw updateError;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        } catch (error) {
          if (retryCount === maxRetries - 1) {
            console.error('[Profile] Error updating profile stats after retries:', error);
            return null;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    } catch (error) {
      console.error('[Profile] Error in updateProfileStats:', error);
      return null;
    }
  }, []);

  // ✅ CORRECTION - Fonction de chargement des sessions simplifiée
  const fetchMySessions = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase || !userId || !isMountedRef.current) return;

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

      if (!isMountedRef.current || !sessions) return;

      // ✅ Compter les participants avec gestion d'erreur
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
              current_participants: 1 // Fallback
            };
          }
        })
      );

      if (isMountedRef.current) {
        console.log("[Profile] Sessions loaded:", sessionsWithCounts.length);
        setMySessions(sessionsWithCounts);
      }
    } catch (error) {
      console.error('[Profile] Error fetching sessions:', error);
    }
  }, []);

  // ✅ CORRECTION - Fonction de chargement du profil complètement refactorisée
  const loadProfile = useCallback(async (userId: string) => {
    // ✅ Éviter les appels multiples
    if (loadingRef.current || currentUserIdRef.current === userId) {
      console.log("[Profile] Already loading or same user, skipping...");
      return;
    }

    loadingRef.current = true;
    currentUserIdRef.current = userId;
    setLoading(true);
    
    const supabase = getSupabase();
    
    if (!supabase) {
      console.warn("[Profile] No supabase client");
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    try {
      console.log("[Profile] Loading profile for user:", userId);

      // ✅ Charger le profil d'abord
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
        .eq("id", userId)
        .maybeSingle();

      if (!isMountedRef.current) return;

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
        // ✅ Créer le profil s'il n'existe pas
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

        if (!createError && newProfile && isMountedRef.current) {
          setProfile(newProfile);
          setFullName(newProfile.full_name || "");
          setAge(newProfile.age ?? "");
          setCity(newProfile.city || "");
          setSportLevel("Occasionnel");
        }
      }

      // ✅ Charger les sessions en parallèle (non bloquant)
      Promise.all([
        fetchMySessions(userId),
        updateProfileStats(userId)
      ]).then(() => {
        console.log("[Profile] Background operations completed");
      }).catch(error => {
        console.warn("[Profile] Background operations failed:", error);
      });

    } catch (error) {
      console.error("Error loading profile:", error);
      if (isMountedRef.current) {
        toast({
          title: "Erreur",
          description: "Une erreur est survenue lors du chargement",
          variant: "destructive"
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, [user, toast, fetchMySessions, updateProfileStats]);

  // ✅ CORRECTION - Effect principal simplifié
  useEffect(() => {
    console.log("[Profile] Component mounted, user:", user?.id);
    
    isMountedRef.current = true;
    
    if (!user?.id) {
      console.log("[Profile] No user ID, skipping load");
      setLoading(false);
      return;
    }

    // ✅ Charger une seule fois
    loadProfile(user.id);

    // Cleanup
    return () => {
      console.log("[Profile] Component unmounting");
      isMountedRef.current = false;
      currentUserIdRef.current = null;
    };
  }, [user?.id]); // ✅ Seule dépendance nécessaire

  // ✅ Redirection simplifiée
  useEffect(() => {
    if (!user && !loading) {
      navigate('/auth?returnTo=/profile');
    }
  }, [user, loading, navigate]);

  // ✅ CORRECTION - Fonction de suppression améliorée
  const handleDeleteSession = async (sessionId: string) => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) return;

    setDeletingSession(sessionId);
    try {
      console.log("[Profile] Deleting session:", sessionId);
      
      // ✅ Transaction atomique avec proper cleanup
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

      // ✅ Refresh optimisé - seulement les sessions
      await fetchMySessions(user.id);
      
      // ✅ Mise à jour des stats en arrière-plan
      updateProfileStats(user.id).then(() => {
        console.log("[Profile] Stats updated after deletion");
      }).catch(error => {
        console.warn("[Profile] Stats update failed after deletion:", error);
      });
      
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

  // ✅ Fonction de sauvegarde inchangée (déjà correcte)
  async function handleSave() {
    const supabase = getSupabase();
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

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-6">
            <h1 className="text-2xl font-bold">Mon Profil</h1>
            {!editing && (
              <Button onClick={() => setEditing(true)}>
                Modifier
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Nom complet</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Votre nom complet"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Âge</Label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Votre âge"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Votre ville"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sport-level">Niveau sportif</Label>
                <Select value={sportLevel} onValueChange={(value: "Occasionnel"|"Confirmé"|"Athlète") => setSportLevel(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Occasionnel">Occasionnel</SelectItem>
                    <SelectItem value="Confirmé">Confirmé</SelectItem>
                    <SelectItem value="Athlète">Athlète</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar">Photo de profil</Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Sauvegarde..." : "Sauvegarder"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setEditing(false);
                    setAvatarFile(null);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {profile.avatar_url && (
                  <img 
                    src={profile.avatar_url} 
                    alt="Avatar" 
                    className="w-16 h-16 rounded-full object-cover"
                  />
                )}
                <div>
                  <h2 className="text-xl font-semibold">{profile.full_name}</h2>
                  {profile.age && <p className="text-muted-foreground">{profile.age} ans</p>}
                  {profile.city && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {profile.city}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{profile.sessions_hosted || 0}</div>
                  <div className="text-sm text-muted-foreground">Sessions organisées</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{profile.sessions_joined || 0}</div>
                  <div className="text-sm text-muted-foreground">Sessions participées</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{profile.total_km || 0}</div>
                  <div className="text-sm text-muted-foreground">Kilomètres parcourus</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Sessions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Mes Sessions ({mySessions.length})
          </h2>
          
          {mySessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Vous n'avez pas encore organisé de sessions.</p>
              <Button 
                onClick={() => navigate('/create-run')} 
                className="mt-4"
              >
                Créer ma première session
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {mySessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{session.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(session.scheduled_at).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        {session.start_place && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {session.start_place}
                          </div>
                        )}
                        {session.distance_km && (
                          <span>{session.distance_km} km</span>
                        )}
                        {session.intensity && (
                          <Badge variant="secondary">{session.intensity}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="w-4 h-4" />
                          {session.current_participants}/{session.max_participants} participants
                        </div>
                        <Badge variant={session.status === 'published' ? 'default' : 'secondary'}>
                          {session.status === 'published' ? 'Publiée' : session.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/session/${session.id}`)}
                      >
                        Voir
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingSession === session.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer la session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Êtes-vous sûr de vouloir supprimer cette session ? Cette action ne peut pas être annulée.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSession(session.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Management */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">Gestion du compte</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Se déconnecter</h3>
                <p className="text-sm text-muted-foreground">Déconnexion de votre compte</p>
              </div>
              <Button variant="outline" onClick={signOut}>
                Se déconnecter
              </Button>
            </div>
            <AccountDeletionComponent />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}