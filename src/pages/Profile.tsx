import { useEffect, useState } from "react";
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

  // form state
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const updateProfileStats = async () => {
    const supabase = getSupabase();
    if (!supabase || !user) return;

    try {
      console.log("[Profile] Updating profile statistics using RPC...");
      
      // Utiliser la fonction RPC pour calculer les stats de manière cohérente
      const { data: statsRaw, error: rpcError } = await supabase
        .rpc('get_user_stats', { target_user_id: user.id });

      if (rpcError) {
        console.error('[Profile] Error getting user stats:', rpcError);
        return;
      }

      if (!statsRaw) {
        console.error('[Profile] No stats returned from RPC');
        return;
      }

      // Type assertion pour les stats
      const stats = statsRaw as {
        sessions_hosted: number;
        sessions_joined: number;
        total_km_hosted: number;
        total_km_joined: number;
        total_km: number;
      };

      console.log("[Profile] Stats calculated from RPC:", stats);

      // Mettre à jour les statistiques dans le profil
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          sessions_hosted: stats.sessions_hosted || 0,
          sessions_joined: stats.sessions_joined || 0,
          total_km: stats.total_km || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('[Profile] Error updating profile stats:', updateError);
        return;
      }

      console.log("[Profile] Profile stats updated:", {
        sessions_hosted: stats.sessions_hosted,
        sessions_joined: stats.sessions_joined,
        total_km: stats.total_km
      });
      
      // Rafraîchir le profil côté client
      await refreshProfile();
    } catch (error) {
      console.error('[Profile] Error updating profile stats:', error);
    }
  };

  const refreshProfile = async () => {
    const supabase = getSupabase();
    if (!supabase || !user) return;

    try {
      console.log("Refreshing profile for user:", user.id);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Profile refresh error:", error);
      } else if (data) {
        console.log("Profile refreshed:", data);
        setProfile(data);
      }
    } catch (error) {
      console.error("Error refreshing profile:", error);
    }
  };

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        console.log("No supabase client");
        setLoading(false);
        return;
      }
      
      setLoading(true);
      console.log("Loading profile...");
      
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { 
          console.log("No authenticated user");
          setLoading(false); 
          return; 
        }

        console.log("Fetching profile for user:", authUser.id);
        
        // Mettre à jour les stats d'abord avec l'utilisateur authentifié
        console.log("[Profile] Updating profile statistics using RPC...");
        try {
          const { data: statsRaw, error: rpcError } = await supabase
            .rpc('get_user_stats', { target_user_id: authUser.id });

          if (rpcError) {
            console.error('[Profile] RPC error:', rpcError);
          } else if (statsRaw) {
            const stats = statsRaw as {
              sessions_hosted: number;
              sessions_joined: number;
              total_km_hosted: number;
              total_km_joined: number;
              total_km: number;
            };

            console.log("[Profile] Stats from RPC:", stats);
            
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ 
                sessions_hosted: stats.sessions_hosted || 0,
                sessions_joined: stats.sessions_joined || 0,
                total_km: stats.total_km || 0,
                updated_at: new Date().toISOString()
              })
              .eq('id', authUser.id);

            if (updateError) {
              console.error('[Profile] Update error:', updateError);
            }
          }
        } catch (statsError) {
          console.error('[Profile] Stats update failed:', statsError);
        }
        
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
          .eq("id", authUser.id)
          .maybeSingle();

        if (error) {
          console.error("Profile fetch error:", error);
        } else if (data) {
          console.log("Profile loaded:", data);
          setProfile(data);
          setFullName(data.full_name || "");
          setAge(data.age ?? "");
          setCity(data.city || "");
          setSportLevel("Occasionnel");
        } else {
          console.log("No profile found for user");
        }

        // Charger les sessions de l'utilisateur
        await fetchMySessions();
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
        console.log("Profile loading finished");
      }
    })();
  }, [user?.id]);

  const fetchMySessions = async () => {
    const supabase = getSupabase();
    if (!supabase || !user) return;

    try {
      console.log("[Profile] Fetching user's sessions...");
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
        .eq('host_id', user.id)
        .in('status', ['published', 'active']) // Même filtre que dans get_user_stats
        .not('scheduled_at', 'is', null) // Exclure les sessions sans date
        .order('scheduled_at', { ascending: false });

      if (error) {
        console.error('[Profile] Error fetching sessions:', error);
        return;
      }

      // Get participant counts for each session
      const sessionsWithCounts = await Promise.all(
        (sessions || []).map(async (session) => {
          const { count } = await supabase
            .from('enrollments')
            .select('*', { count: 'exact' })
            .eq('session_id', session.id)
            .in('status', ['paid', 'included_by_subscription', 'confirmed']);

          return {
            ...session,
            current_participants: (count || 0) + 1 // +1 pour l'organisateur
          };
        })
      );

      console.log("[Profile] User sessions loaded:", sessionsWithCounts);
      setMySessions(sessionsWithCounts);
    } catch (error) {
      console.error('[Profile] Error fetching sessions:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    setDeletingSession(sessionId);
    try {
      console.log("[Profile] Deleting session:", sessionId);
      
      // Delete enrollments first
      const { error: enrollmentsError } = await supabase
        .from('enrollments')
        .delete()
        .eq('session_id', sessionId);

      if (enrollmentsError) {
        console.error('[Profile] Error deleting enrollments:', enrollmentsError);
        throw enrollmentsError;
      }

      // Then delete the session
      const { error: sessionError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .eq('host_id', user?.id); // Security: only delete own sessions

      if (sessionError) {
        console.error('[Profile] Error deleting session:', sessionError);
        throw sessionError;
      }

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès."
      });

      // Recalculer et mettre à jour les statistiques du profil
      await updateProfileStats();
      
      // Refresh sessions list
      await fetchMySessions();
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

  async function handleSave() {
    const supabase = getSupabase();
    if (!supabase || !profile) return;
    
    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      let avatarUrl = profile.avatar_url || null;

      // Upload avatar si nouveau fichier
      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${authUser.id}/avatar.${ext}`;

        // Upload avec upsert
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

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          age: age === "" ? null : Number(age),
          city,
          // sport_level removed from new schema
          avatar_url: avatarUrl,
        })
        .eq("id", authUser.id);

      if (error) {
        toast({
          title: "Erreur",
          description: "Erreur mise à jour profil : " + error.message,
          variant: "destructive"
        });
        return;
      }

      setProfile({
        ...profile,
        full_name: fullName,
        age: age === "" ? null : Number(age),
        city,
        // sport_level removed from new schema
        avatar_url: avatarUrl,
      });
      
      setEditing(false);
      setAvatarFile(null);
      
      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été sauvegardées avec succès."
      });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la sauvegarde.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      toast({
        title: "Erreur de déconnexion",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <div className="text-center">Chargement…</div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="mb-4">Merci de vous connecter.</p>
              <Button onClick={() => window.location.href = '/auth?returnTo=/profile'}>
                Se connecter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>

      {/* Statistiques */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Mes statistiques</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Sessions organisées</div>
              <div className="text-xl font-bold text-primary">{profile.sessions_hosted || 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sessions rejointes</div>
              <div className="text-xl font-bold text-primary">{profile.sessions_joined || 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total km</div>
              <div className="text-xl font-bold text-primary">{(profile.total_km || 0).toFixed(1)} km</div>
            </div>
            <div>
              <div className="text-muted-foreground">Km parcourus</div>
              <div className="text-xl font-bold text-primary">{(profile.total_km || 0).toFixed(1)} km</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profil */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                <span className="text-muted-foreground text-2xl">
                  {profile.full_name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold">{profile.full_name || "Nom non renseigné"}</h2>
              <p className="text-muted-foreground">
                {(profile.age ? `${profile.age} ans` : "Âge non renseigné")}
                {" • "}
                {profile.city || "Ville inconnue"}
              </p>
              <p className="text-muted-foreground">
                Niveau : Occasionnel
              </p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nom complet</Label>
                <Input
                  id="fullName"
                  placeholder="Nom complet"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Âge</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Âge"
                  value={age}
                  onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
                  min={5}
                  max={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ville de résidence</Label>
                <Input
                  id="city"
                  placeholder="Ville de résidence"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sportLevel">Niveau sportif</Label>
                <Select value={sportLevel} onValueChange={(value: any) => setSportLevel(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
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
                {avatarFile && (
                  <p className="text-sm text-muted-foreground">
                    Fichier sélectionné : {avatarFile.name}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => { 
                    setEditing(false); 
                    setAvatarFile(null);
                    // Reset form values
                    setFullName(profile.full_name || "");
                    setAge(profile.age ?? "");
                    setCity(profile.city || "");
                    setSportLevel("Occasionnel");
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setEditing(true)}>
              Modifier mon profil
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Mes sessions organisées */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Mes sessions organisées</h2>
          {mySessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">Aucune session créée</p>
              <Button onClick={() => navigate('/create')}>
                Créer ma première session
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {mySessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{session.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(session.scheduled_at).toLocaleDateString('fr-FR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {session.start_place && (
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {session.start_place}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={14} />
                          {session.current_participants}/{session.max_participants}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={session.status === 'published' ? 'default' : 'secondary'}>
                        {session.status === 'published' ? 'Publiée' : session.status}
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingSession === session.id}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer la session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Êtes-vous sûr de vouloir supprimer "{session.title}" ? 
                              Cette action est irréversible et tous les participants inscrits seront automatiquement désinscrits.
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
                  
                  <div className="flex gap-2 flex-wrap">
                    {session.distance_km && (
                      <Badge variant="secondary">{session.distance_km} km</Badge>
                    )}
                    {session.intensity && (
                      <Badge variant="outline">{session.intensity}</Badge>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/session/${session.id}`)}
                    >
                      Voir détails
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/session/${session.id}/edit`)}
                    >
                      Modifier
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions du compte */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Actions du compte</h2>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="w-full"
            >
              Se déconnecter
            </Button>
            <AccountDeletionComponent />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}