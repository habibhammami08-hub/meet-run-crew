import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, AlertTriangle, ShieldAlert, CheckCircle2, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

type Profile = {
  id: string;
  full_name: string;
  age?: number | null;
  city?: string | null;
  gender?: "homme" | "femme" | null;
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
  const { user, signOut, hasActiveSubscription: hasSub } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- État suppression compte
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState<"homme" | "femme" | "">("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const supabase = getSupabase();

  // Refs
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Redirection : on la BLOQUE si deleteSuccess === true pour montrer l'écran
  useEffect(() => {
    if (user === null && !deleteSuccess) {
      navigate('/auth?returnTo=/profile');
      return;
    }
    if (user === undefined) return;
    if (user && loading && mountedRef.current) {
      loadProfile(user.id);
    }
  }, [user, navigate, deleteSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚙️ Récupère les sessions où tu es hôte OU inscrit
  const fetchMySessions = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
      // 1) sessions où je suis hôte
      const { data: hosted, error: hostedErr } = await supabase
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
        .not('scheduled_at', 'is', null);

      if (hostedErr) throw hostedErr;

      // 2) mes enrollments
      const { data: enrollments, error: enrErr } = await supabase
        .from('enrollments')
        .select('session_id')
        .eq('user_id', userId)
        .in('status', ['paid', 'included_by_subscription', 'confirmed']);

      if (enrErr) throw enrErr;

      const sessionIds = Array.from(new Set((enrollments ?? []).map(e => e.session_id)));
      // 3) sessions où je suis inscrit (si nécessaire)
      let joined: Session[] = [];
      if (sessionIds.length > 0) {
        const { data: joinedData, error: joinedErr } = await supabase
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
          .in('id', sessionIds)
          .in('status', ['published', 'active'])
          .not('scheduled_at', 'is', null);
        if (joinedErr) throw joinedErr;
        joined = (joinedData ?? []) as Session[];
      }

      // 4) merge (sans doublons)
      const mergedMap = new Map<string, Session>();
      (hosted ?? []).forEach(s => mergedMap.set(s.id, s as Session));
      joined.forEach(s => mergedMap.set(s.id, s));

      const merged = Array.from(mergedMap.values());

      // 5) complète le compteur participants = (inscrits éligibles) + 1 (hôte)
      const sessionsWithCounts = await Promise.all(
        merged.map(async (session) => {
          try {
            const { count } = await supabase
              .from('enrollments')
              .select('*', { count: 'exact' })
              .eq('session_id', session.id)
              .in('status', ['paid', 'included_by_subscription', 'confirmed']);
            return { ...session, current_participants: (count || 0) + 1 };
          } catch {
            return { ...session, current_participants: 1 };
          }
        })
      );

      // 6) tri (mêmes critères que l’existant)
      sessionsWithCounts.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

      if (mountedRef.current) setMySessions(sessionsWithCounts);
    } catch (error) {
      if (mountedRef.current) console.error('[Profile] Error fetching sessions:', error);
    }
  }, [supabase]);

  const updateProfileStats = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
      const [{ count: sessionsHosted }, { count: sessionsJoined }] = await Promise.all([
        supabase.from('sessions').select('*', { count: 'exact' }).eq('host_id', userId).eq('status', 'published'),
        supabase.from('enrollments').select('*', { count: 'exact' }).eq('user_id', userId).in('status', ['paid', 'included_by_subscription', 'confirmed'])
      ]);

      const { data: hostedSessions } = await supabase
        .from('sessions')
        .select('distance_km')
        .eq('host_id', userId)
        .eq('status', 'published');
      
      const totalKmHosted = hostedSessions?.reduce((sum, s) => sum + (s.distance_km || 0), 0) || 0;

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('session_id')
        .eq('user_id', userId)
        .in('status', ['paid', 'included_by_subscription', 'confirmed']);

      let totalKmJoined = 0;
      if (enrollments && enrollments.length > 0) {
        const sessionIds = enrollments.map(e => e.session_id);
        const { data: joinedSessions } = await supabase
          .from('sessions')
          .select('distance_km')
          .in('id', sessionIds)
          .eq('status', 'published');
        
        totalKmJoined = joinedSessions?.reduce((sum, s) => sum + (s.distance_km || 0), 0) || 0;
      }

      const totalKm = totalKmHosted + totalKmJoined;

      if (!mountedRef.current) return;
      await supabase
        .from('profiles')
        .update({ 
          sessions_hosted: sessionsHosted || 0,
          sessions_joined: sessionsJoined || 0,
          total_km: totalKm,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    } catch (error) {
      if (mountedRef.current) console.error('[Profile] Error updating profile stats:', error);
    }
  }, [supabase]);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase || !mountedRef.current) {
      setLoading(false);
      return;
    }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, age, city, gender, avatar_url, sessions_hosted, sessions_joined, total_km")
        .eq("id", userId)
        .maybeSingle();

      if (signal.aborted || !mountedRef.current) return;

      if (profileError) {
        toast({ title: "Erreur", description: "Impossible de charger le profil", variant: "destructive" });
      } else if (profileData) {
        setProfile(profileData as Profile);
        setFullName(profileData.full_name || "");
        setAge(profileData.age ?? "");
        setCity(profileData.city || "");
        setGender(profileData.gender ?? "");
        setSportLevel("Occasionnel");
      } else {
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
          setProfile(newProfile as Profile);
          setFullName(newProfile.full_name || "");
          setAge(newProfile.age ?? "");
          setCity(newProfile.city || "");
          setGender(newProfile.gender ?? "");
          setSportLevel("Occasionnel");
        }
      }

      if (signal.aborted || !mountedRef.current) return;
      await Promise.all([fetchMySessions(userId), updateProfileStats(userId)]);
    } catch (error: any) {
      if (error.name !== 'AbortError' && mountedRef.current) {
        console.error("Error loading profile:", error);
        toast({ title: "Erreur", description: "Une erreur est survenue lors du chargement", variant: "destructive" });
      }
    } finally {
      if (!signal.aborted && mountedRef.current) setLoading(false);
    }
  }, [supabase, user, toast, fetchMySessions, updateProfileStats]);

  // Suppression de compte — inchangé
  const handleConfirmDeleteAccount = async () => {
    if (!supabase) return;
    setDeletingAccount(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const { error } = await supabase.functions.invoke("delete-account2", {
        headers: { Authorization: `Bearer ${token}` },
        body: {},
      });
      if (error) throw error;

      setDeleteSuccess(true);
      setDeleteDialogOpen(false);
      await supabase.auth.signOut();
    } catch (e: any) {
      toast({
        title: "Suppression impossible",
        description: e?.message || "Une erreur est survenue lors de la suppression du compte.",
        variant: "destructive",
      });
      setDeleteSuccess(false);
    } finally {
      setDeletingAccount(false);
    }
  };

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Écran succès suppression compte — inchangé
  if (deleteSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Vous allez nous manquer 😕
            </CardTitle>
            <CardDescription className="text-base">
              Votre compte a bien été supprimé. Merci d’avoir fait un bout de chemin avec nous.
              <br className="hidden sm:block" />
              Vous serez toujours la bienvenue si vous souhaitez revenir. 💛
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-center">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Vos sessions et inscriptions ont été annulées conformément à nos règles.</p>
              <p>Vous pouvez revenir quand vous voulez — on gardera la piste prête 🏃‍♀️.</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              className="w-full sm:w-auto"
              onClick={() => navigate("/", { replace: true })}
            >
              Retour à l’accueil
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

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
                <Label htmlFor="gender">Genre</Label>
                <Select value={gender || ""} onValueChange={(value: "homme" | "femme") => setGender(value)}>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Votre genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homme">Homme</SelectItem>
                    <SelectItem value="femme">Femme</SelectItem>
                  </SelectContent>
                </Select>
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{profile.full_name}</h2>
                    {hasSub && (
                      <Button
                        size="sm"
                        onClick={() => navigate("/subscription")}
                        variant="secondary"
                        className="ml-1 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm"
                        aria-label="Abonnement actif : gérer"
                        title="Abonnement actif : MeetRun Unlimited"
                      >
                        <Crown className="w-4 h-4" />
                        Unlimited
                      </Button>
                    )}
                  </div>
                  {(profile.age || profile.gender) && (
                    <p className="text-muted-foreground">
                      {profile.age ? `${profile.age} ans` : null}
                      {profile.age && profile.gender ? ' · ' : ''}
                      {profile.gender ? (profile.gender === 'homme' ? 'Homme' : 'Femme') : null}
                    </p>
                  )}
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

      {/* Mes Sessions (hôte OU inscrit) */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Mes Sessions ({mySessions.length})
          </h2>
          
          {mySessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Vous n'avez pas encore de sessions.</p>
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
                      {/* 🔕 Bouton corbeille/désinscription retiré, simplification demandée */}
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

          <div className="flex items-center justify-start mb-6">
            <Button variant="outline" onClick={signOut}>
              Se déconnecter
            </Button>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
            <div className="max-w-3xl mx-auto text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-red-700">
                <ShieldAlert className="w-5 h-5" />
                <span className="font-semibold">Zone sensible</span>
              </div>
              <h3 className="text-xl font-bold text-red-800">Supprimer mon compte</h3>
              <p className="text-sm text-red-700 leading-relaxed">
                Cette action est <strong>définitive</strong>. Toutes vos données seront supprimées (profil, inscriptions,
                sessions créées…). <br />
                <strong>Attention :</strong> la suppression du compte entraînera la <u>résiliation immédiate de votre abonnement</u> s’il est en cours.
              </p>

              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="mt-2">
                    Supprimer mon compte
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent className="sm:max-w-lg">
                  {!deleteSuccess ? (
                    <>
                      <AlertDialogHeader className="space-y-2">
                        <div className="flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                          </div>
                        </div>
                        <AlertDialogTitle className="text-center">
                          Confirmer la suppression
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                          Êtes-vous sûr de vouloir supprimer définitivement votre compte ?
                          <br />
                          Cela résiliera immédiatement votre abonnement s’il est actif.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="sm:justify-center gap-2">
                        <AlertDialogCancel disabled={deletingAccount}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={handleConfirmDeleteAccount}
                          disabled={deletingAccount}
                        >
                          {deletingAccount ? "Suppression..." : "Confirmer la suppression"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </>
                  ) : (
                    <></>
                  )}
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
