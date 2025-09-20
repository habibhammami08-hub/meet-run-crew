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

  // UI state (ajouté) : contrôle Afficher plus/moins & pagination
  const [expandedSessions, setExpandedSessions] = useState(false);
  const [sessionPage, setSessionPage] = useState(0); // pages de 6 en mode étendu

  // Form state
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const supabase = getSupabase();

  // CORRECTION: Refs pour gérer les cleanup et éviter les fuites mémoire
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 🔒 Masquer un éventuel bouton “Re-vérifier” rendu par un composant enfant, sans toucher au backend
  useEffect(() => {
    const hideReverify = () => {
      const btns = Array.from(document.querySelectorAll('button'));
      btns.forEach((b) => {
        const t = (b.textContent || "").toLowerCase();
        if (t.includes("re-vérifier") || t.includes("revérifier") || t.includes("re verifier") || t.includes("reverifier")) {
          (b as HTMLButtonElement).style.display = "none";
        }
      });
    };
    hideReverify();
  }, []);

  // CORRECTION: Redirection avec cleanup
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
  }, [user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // CORRECTION: Fonction de chargement des sessions avec AbortController
  const fetchMySessions = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;

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

      if (!mountedRef.current) return;

      if (error) {
        console.error('[Profile] Error fetching sessions:', error);
        return;
      }

      if (!sessions) return;

      // Compter les participants avec gestion d'erreur
      const sessionsWithCounts = await Promise.all(
        sessions.map(async (session) => {
          if (!mountedRef.current) return null;
          
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

      // Filtrer les null et vérifier si le composant est encore monté
      const validSessions = sessionsWithCounts.filter(Boolean) as Session[];
      
      if (mountedRef.current) {
        console.log("[Profile] Sessions loaded:", validSessions.length);
        setMySessions(validSessions);
      }
    } catch (error) {
      if (mountedRef.current) {
        console.error('[Profile] Error fetching sessions:', error);
      }
    }
  }, [supabase]);

  // CORRECTION: Fonction de mise à jour des stats avec vérification mounted
  const updateProfileStats = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;

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

      if (!mountedRef.current) return;

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
      if (mountedRef.current) {
        console.error('[Profile] Error updating profile stats:', error);
      }
    }
  }, [supabase]);

  // CORRECTION: Fonction de chargement du profil avec AbortController
  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase || !mountedRef.current) {
      setLoading(false);
      return;
    }

    // Annuler la requête précédente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Créer un nouveau controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    
    try {
      console.log("[Profile] Loading profile for user:", userId);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
        .eq("id", userId)
        .maybeSingle();

      if (signal.aborted || !mountedRef.current) return;

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

      // Charger les sessions et mettre à jour les stats
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

  // CORRECTION: Fonction de suppression avec vérification mounted
  const handleDeleteSession = async (sessionId: string) => {
    if (!supabase || !user?.id || !mountedRef.current) return;

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

  // CORRECTION: Fonction de sauvegarde avec vérification mounted
  async function handleSave() {
    if (!supabase || !profile || !user?.id || !mountedRef.current) return;
    
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

  // CORRECTION: Cleanup général strict
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      console.log("[Profile] Component unmounting - cleaning up all resources");
      mountedRef.current = false;
      
      // Cleanup AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Si l'utilisateur n'est pas connecté, on ne render rien (redirection en cours)
  if (user === null) {
    return null;
  }

  // Si on est en cours de chargement de l'auth
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

  // Si on est en cours de chargement du profil
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

  // --- Sessions: logique d'affichage 3 / 6 + pagination en bas ---
  const pageSize = expandedSessions ? 6 : 3;
  const totalPages = expandedSessions ? Math.max(1, Math.ceil(mySessions.length / pageSize)) : 1;
  const currentPage = expandedSessions ? sessionPage : 0;
  const start = currentPage * pageSize;
  const displayedSessions = mySessions.slice(start, start + pageSize);

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-6">
            <h1 className="text-2xl font-bold">Mon Profil</h1>

            {/* ⇢ En édition : bouton Sauvegarder au lieu de disparaître */}
            {editing ? (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            ) : (
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

              {/* Avatar => caché en mobile, visible dès md */}
              <div className="space-y-2 hidden md:block">
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
                onClick={() => navigate('/create')} 
                className="mt-4"
              >
                Créer ma première session
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedSessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  {/* Layout mobile safe: pas de débordement des boutons */}
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{session.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
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
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="w-4 h-4" />
                          {session.current_participants}/{session.max_participants} participants
                        </div>
                        <Badge variant={session.status === 'published' ? 'default' : 'secondary'}>
                          {session.status === 'published' ? 'Publiée' : session.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="w-full md:w-auto flex gap-2 justify-end md:justify-start">
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

              {/* Bouton "Afficher plus" sous la 3e carte (si >3) */}
              {!expandedSessions && mySessions.length > 3 && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setExpandedSessions(true); setSessionPage(0); }}
                  >
                    Afficher plus
                  </Button>
                </div>
              )}

              {/* Contrôles en bas en mode étendu (6 par page) */}
              {expandedSessions && (
                <>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
                        disabled={sessionPage === 0}
                      >
                        Page précédente
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        Page {sessionPage + 1} / {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSessionPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={sessionPage >= totalPages - 1}
                      >
                        Page suivante
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setExpandedSessions(false); setSessionPage(0); }}
                    >
                      Afficher moins
                    </Button>
                  </div>
                </>
              )}
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
            {/* Le bouton "Re-vérifier" (s'il existe dans un sous-composant) est masqué via le useEffect plus haut */}
            <AccountDeletionComponent />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
