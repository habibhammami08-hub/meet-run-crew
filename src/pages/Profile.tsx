// src/pages/Profile.tsx
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

// ✅ Helpers refresh + retry
function getSb() { return getSupabase(); }

async function withAuthRetry<T>(fn: () => Promise<T>) {
  const supabase = getSb();
  try {
    return await fn();
  } catch {
    try { await supabase.auth.refreshSession(); } catch {}
    return await fn();
  }
}

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

  const supabase = getSupabase();

  // Refs cleanup
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Redirection avec cleanup
  useEffect(() => {
    if (user === null) {
      navigate('/auth?returnTo=/profile');
      return;
    }
    if (user === undefined) {
      return;
    }
    if (user && loading && mountedRef.current) {
      loadProfile(user.id);
    }
  }, [user, navigate]); // eslint-disable-line

  // Chargement des sessions (avec retry)
  const fetchMySessions = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;

    try {
      // refresh silencieux
      await supabase.auth.refreshSession().catch(() => {});

      const { data: sessions, error } = await withAuthRetry(() =>
        supabase
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
          .order('scheduled_at', { ascending: false })
      ) as any;

      if (!mountedRef.current) return;

      if (error) {
        console.error('[Profile] Error fetching sessions:', error);
        return;
      }

      if (!sessions) return;

      // Compter les participants
      const sessionsWithCounts = await Promise.all(
        sessions.map(async (session: Session) => {
          if (!mountedRef.current) return null;
          try {
            const { count } = await withAuthRetry(() =>
              supabase
                .from('enrollments')
                .select('*', { count: 'exact' })
                .eq('session_id', session.id)
                .in('status', ['paid', 'included_by_subscription', 'confirmed'])
            ) as any;
            return {
              ...session,
              current_participants: (count || 0) + 1
            };
          } catch (err) {
            console.warn(`[Profile] Error counting participants for session ${session.id}:`, err);
            return {
              ...session,
              current_participants: 1
            };
          }
        })
      );

      const validSessions = sessionsWithCounts.filter(Boolean) as Session[];
      if (mountedRef.current) {
        setMySessions(validSessions);
      }
    } catch (error) {
      if (mountedRef.current) {
        console.error('[Profile] Error fetching sessions:', error);
      }
    }
  }, [supabase]);

  // Update stats profil (avec retry)
  const updateProfileStats = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;

    try {
      await supabase.auth.refreshSession().catch(() => {});
      
      const [{ count: sessionsHosted }, { count: sessionsJoined }] = await Promise.all([
        withAuthRetry(() =>
          supabase
            .from('sessions')
            .select('*', { count: 'exact' })
            .eq('host_id', userId)
            .eq('status', 'published')
        ) as any,
        withAuthRetry(() =>
          supabase
            .from('enrollments')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .in('status', ['paid', 'included_by_subscription', 'confirmed'])
        ) as any
      ]);

      if (!mountedRef.current) return;

      await withAuthRetry(() =>
        supabase
          .from('profiles')
          .update({ 
            sessions_hosted: sessionsHosted || 0,
            sessions_joined: sessionsJoined || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
      );
    } catch (error) {
      if (mountedRef.current) {
        console.error('[Profile] Error updating profile stats:', error);
      }
    }
  }, [supabase]);

  // Chargement du profil (avec refresh + retry)
  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase || !mountedRef.current) {
      setLoading(false);
      return;
    }

    // Annuler la requête précédente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    
    try {
      await supabase.auth.refreshSession().catch(() => {});

      const { data: profileData, error: profileError } = await withAuthRetry(() =>
        supabase
          .from("profiles")
          .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
          .eq("id", userId)
          .maybeSingle()
      ) as any;

      if (signal.aborted || !mountedRef.current) return;

      if (profileError) {
        console.error("Profile fetch error:", profileError);
        toast({
          title: "Erreur",
          description: "Impossible de charger le profil",
          variant: "destructive"
        });
      } else if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || "");
        setAge(profileData.age ?? "");
        setCity(profileData.city || "");
        setSportLevel("Occasionnel");
      } else {
        const { data: newProfile, error: createError } = await withAuthRetry(() =>
          supabase
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
            .single()
        ) as any;

        if (signal.aborted || !mountedRef.current) return;

        if (!createError && newProfile) {
          setProfile(newProfile);
          setFullName(newProfile.full_name || "");
          setAge(newProfile.age ?? "");
          setCity(newProfile.city || "");
          setSportLevel("Occasionnel");
        }
      }

      if (signal.aborted || !mountedRef.current) return;

      await Promise.all([
        fetchMySessions(userId),
        updateProfileStats(userId)
      ]);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("[Profile] Request aborted");
      } else if (mountedRef.current) {
        console.error("Error loading profile:", error);
        toast({
          title: "Erreur",
          description: "Une erreur est survenue lors du chargement",
          variant: "destructive"
        });
      }
    } finally {
      if (!signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [supabase, user, toast, fetchMySessions, updateProfileStats]);

  // Suppression session (avec retry)
  const handleDeleteSession = async (sessionId: string) => {
    if (!supabase || !user?.id || !mountedRef.current) return;

    setDeletingSession(sessionId);
    try {
      await supabase.auth.refreshSession().catch(() => {});
      
      const { error: sessionError } = await withAuthRetry(() =>
        supabase
          .from('sessions')
          .delete()
          .eq('id', sessionId)
          .eq('host_id', user.id)
      ) as any;

      if (sessionError) {
        throw sessionError;
      }

      if (mountedRef.current) {
        toast({
          title: "Session supprimée",
          description: "La session a été supprimée avec succès."
        });

        await fetchMySessions(user.id);
        updateProfileStats(user.id);
      }
      
    } catch (error: any) {
      if (mountedRef.current) {
        console.error('[Profile] Delete error:', error);
        toast({
          title: "Erreur",
          description: "Impossible de supprimer la session: " + error.message,
          variant: "destructive"
        });
      }
    } finally {
      if (mountedRef.current) {
        setDeletingSession(null);
      }
    }
  };

  // Sauvegarde profil (inchangée sur le fond, juste refresh avant)
  async function handleSave() {
    if (!supabase || !profile || !user?.id || !mountedRef.current) return;
    
    setSaving(true);
    try {
      await supabase.auth.refreshSession().catch(() => {});

      let avatarUrl = profile.avatar_url || null;

      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.id}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });

        if (uploadError) {
          if (mountedRef.current) {
            toast({
              title: "Erreur",
              description: "Erreur upload image : " + uploadError.message,
              variant: "destructive"
            });
          }
          return;
        }

        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = pub.publicUrl;
      }

      if (!mountedRef.current) return;

      const ageValue = age === "" ? null : Number(age);
      const { error } = await withAuthRetry(() =>
        supabase
          .from("profiles")
          .update({
            full_name: fullName,
            age: ageValue,
            city: city,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
          })
          .eq("id", user.id)
      ) as any;

      if (!mountedRef.current) return;

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
      if (mountedRef.current) {
        toast({
          title: "Erreur",
          description: "Une erreur est survenue: " + error.message,
          variant: "destructive"
        });
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      console.log("[Profile] Component unmounting - cleaning up all resources");
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // États d'UI
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

      {/* Mes sessions */}
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
                onClick={() => navigate('/create')} 
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
