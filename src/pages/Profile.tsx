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
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, AlertTriangle, CheckCircle2, Crown, User, ArrowRight, Route, Zap, UserMinus } from "lucide-react";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import LeaveSessionDialog, { type LeaveSessionTarget } from "@/components/LeaveSessionDialog";
import { cn } from "@/lib/utils";
import { useNavigate, Link } from "react-router-dom";
import logoImage from "@/assets/meetrun-logo-final.png";
import { isFreePromoActive } from "@/config/promo";
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

// ⭐ Imports pour l'écran plein écran (même pattern que Auth)
import { CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import AvatarEditor from "@/components/AvatarEditor";

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
  start_place?: string | null;
  distance_km?: number | null;
  intensity?: string | null;
  max_participants: number;
  status: string;
  // ▼ ajouts pour fusionner hôte/participant
  host_id?: string | null;
  participants_count?: number | null;
  // ▼ champ utilisé par l’UI
  current_participants: number;
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
      navigate(`/auth?${isFreePromoActive() ? "mode=signup&" : ""}returnTo=/profile`);
      return;
    }
    if (user === undefined) return;
    if (user && loading && mountedRef.current) {
      loadProfile(user.id);
    }
  }, [user, navigate, deleteSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMySessions = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
      // 1) Sessions où je suis hôte
      const { data: hostSessions, error: hostErr } = await supabase
        .from('sessions')
        .select(`
          id,
          title,
          scheduled_at,
          start_place,
          distance_km,
          intensity,
          max_participants,
          status,
          host_id,
          participants_count
        `)
        .eq('host_id', userId)
        .in('status', ['published', 'active'])
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: false });

      if (hostErr) {
        console.warn('[Profile] host sessions error:', hostErr.message);
      }

      // 2) Sessions où je suis participant (paid / included_by_subscription / confirmed)
      const { data: enrollments, error: enrErr } = await supabase
        .from('enrollments')
        .select('session_id')
        .eq('user_id', userId)
        .in('status', ['paid', 'included_by_subscription', 'confirmed']);

      let joinedSessions: any[] = [];
      if (!enrErr && enrollments && enrollments.length > 0) {
        const sessionIds = enrollments.map(e => e.session_id);
        const { data: sessionsData, error: joinedErr } = await supabase
          .from('sessions')
          .select(`
            id,
            title,
            scheduled_at,
            start_place,
            distance_km,
            intensity,
            max_participants,
            status,
            host_id,
            participants_count
          `)
          .in('id', sessionIds)
          .in('status', ['published', 'active'])
          .not('scheduled_at', 'is', null);

        if (!joinedErr && sessionsData) {
          joinedSessions = sessionsData;
        } else if (joinedErr) {
          console.warn('[Profile] joined sessions error:', joinedErr.message);
        }
      }

      // 3) Fusion + dédoublonnage par id
      const mapById = new Map<string, any>();
      for (const s of hostSessions ?? []) mapById.set(s.id, s);
      for (const s of joinedSessions ?? []) mapById.set(s.id, s);

      // 4) Projection + current_participants via participants_count (fallback 1)
      const merged: Session[] = Array.from(mapById.values()).map((s: any) => ({
        id: s.id,
        title: s.title,
        scheduled_at: s.scheduled_at,
        start_place: s.start_place ?? null,
        distance_km: s.distance_km ?? null,
        intensity: s.intensity ?? null,
        max_participants: s.max_participants,
        status: s.status,
        host_id: s.host_id ?? null,
        participants_count: s.participants_count ?? null,
        current_participants: (s.participants_count ?? 0) + 1,
      }));

      // 5) Tri descendant (prochaines en haut si tu préfères, passe à ascending:true)
      merged.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

      if (mountedRef.current) setMySessions(merged);
    } catch (error) {
      if (mountedRef.current) console.error('[Profile] Error fetching sessions:', error);
    }
  }, [supabase]);

  const updateProfileStats = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
      // Compte des sessions
      const [{ count: sessionsHosted }, { count: sessionsJoined }] = await Promise.all([
        supabase.from('sessions').select('*', { count: 'exact' }).eq('host_id', userId).eq('status', 'published'),
        supabase.from('enrollments').select('*', { count: 'exact' }).eq('user_id', userId).in('status', ['paid', 'included_by_subscription', 'confirmed'])
      ]);

      // Calcul des km hébergés
      const { data: hostedSessions } = await supabase
        .from('sessions')
        .select('distance_km')
        .eq('host_id', userId)
        .eq('status', 'published');
      
      const totalKmHosted = hostedSessions?.reduce((sum, s) => sum + (s.distance_km || 0), 0) || 0;

      // Calcul des km en tant que participant
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

  // ✅ Sauvegarde (corrige l’erreur TS2304 si manquante)
  async function handleSave() {
    if (!supabase || !profile || !user?.id || !mountedRef.current) return;
    setSaving(true);
    try {
      let avatarUrl = profile.avatar_url || null;

      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
        if (uploadError) {
          if (mountedRef.current) toast({ title: "Erreur", description: "Erreur upload image : " + uploadError.message, variant: "destructive" });
          return;
        }
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = pub.publicUrl;
      }

      if (!mountedRef.current) return;

      const ageValue = age === "" ? null : Number(age);
      const genderValue = gender === "" ? null : gender;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          age: ageValue,
          city: city,
          gender: genderValue,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (!mountedRef.current) return;

      if (error) {
        toast({ title: "Erreur", description: "Erreur de sauvegarde: " + error.message, variant: "destructive" });
        return;
      }

      setProfile(prev => prev ? { ...prev, full_name: fullName, age: ageValue, city, gender: genderValue as Profile["gender"], avatar_url: avatarUrl } : null);
      setEditing(false);
      setAvatarFile(null);
      toast({ title: "Profil mis à jour", description: "Vos modifications ont été sauvegardées." });
    } catch (error: any) {
      if (mountedRef.current) toast({ title: "Erreur", description: "Une erreur est survenue: " + error.message, variant: "destructive" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  // Suppression de compte — appelle l’Edge Function puis montre l'écran plein écran façon Auth
  const handleConfirmDeleteAccount = async () => {
    if (!supabase) return;
    setDeletingAccount(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const { error } = await supabase.functions.invoke("delete-account2", {
        headers: { Authorization: `Bearer ${token}` },
        body: {}, // explicite
      });
      if (error) throw error;

      // Affiche l'écran de succès en PLEIN ÉCRAN
      setDeleteSuccess(true);
      setDeleteDialogOpen(false);

      // Invalide la session locale (sans redirection auto)
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

  // ✅ ÉCRAN PLEIN ÉCRAN DE SUCCÈS (inspiré de Auth) — mobile-first
  if (deleteSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-deep/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-deep" />
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

          {/* 👇 Seul bouton conservé comme demandé */}
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

  // Si l'utilisateur n'est pas connecté ET on n'est pas en succès (cas normal)
  if (user === null) {
    return null;
  }

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-deep">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link to="/">
            <img
              src={logoImage}
              alt="MeetRun Logo"
              className="h-10 w-auto cursor-pointer"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/profile")} className="flex items-center gap-2 text-white hover:text-white hover:bg-white/10">
              <User size={16} />
              Profil
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-6 pt-24">
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
                <AvatarEditor
                  userId={user.id}
                  avatarUrl={profile.avatar_url}
                  name={profile.full_name}
                  onChange={(url) => setProfile(prev => prev ? { ...prev, avatar_url: url } : prev)}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{profile.full_name}</h2>
                    {hasSub && (
                      <Button
                        size="sm"
                        onClick={() => navigate("/subscription")}
                        variant="secondary"
                        className="ml-1 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm"
                        aria-label={isFreePromoActive() ? "Unlimited offert jusqu’au 31 mars 2027" : "Abonnement actif : gérer"}
                        title={isFreePromoActive() ? "Unlimited offert jusqu’au 31 mars 2027" : "Abonnement actif : MeetRun Unlimited"}
                      >
                        <Crown className="w-4 h-4" />
                        Unlimited
                      </Button>
                    )}
                  </div>
                  {hasSub && isFreePromoActive() && <p className="text-sm font-medium text-primary">Offert jusqu’au 31 mars 2027</p>}
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

      {/* My Sessions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Mes Sessions ({mySessions.length})
          </h2>
          
          {mySessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Vous n'avez pas encore de sessions à venir.</p>
              <Button 
                onClick={() => navigate('/create')} 
                className="mt-4"
              >
                Créer ma première session
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {mySessions.map((session) => {
                const scheduled = new Date(session.scheduled_at);
                const isPastSession = scheduled.getTime() < Date.now();
                const isHost = session.host_id === user?.id;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group border rounded-xl p-4 transition-colors hover:bg-muted/50",
                      isPastSession && "opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base truncate">{session.title}</h3>
                          {isHost && (
                            <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">Hôte</Badge>
                          )}
                          {isPastSession && (
                            <Badge variant="outline" className="h-5 shrink-0 text-[10px]">Terminée</Badge>
                          )}
                        </div>

                        {/* Date · heure sur une seule ligne */}
                        <div className="mt-2 space-y-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                            <Calendar className="h-3 w-3" />
                            {scheduled.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                            {" · "}
                            {scheduled.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {session.start_place && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{session.start_place}</span>
                            </div>
                          )}
                        </div>

                        {/* Intensité · distance · participants sur la même ligne */}
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                          {session.intensity && (
                            <Badge variant="outline" className="h-6 gap-1 text-[11px] font-medium">
                              <Zap className="h-2.5 w-2.5 text-muted-foreground" />
                              {dbToUiIntensity(session.intensity)}
                            </Badge>
                          )}
                          {session.distance_km ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                              <Route className="h-3 w-3" />
                              <span className="tabular-nums">{session.distance_km} km</span>
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <span className="tabular-nums">{session.current_participants}/{session.max_participants}</span>
                          </span>
                        </div>
                      </div>

                      {/* Bouton « Voir » en haut à droite, vert profond */}
                      <Button
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs font-bold"
                        onClick={() => navigate(`/session/${session.id}`)}
                      >
                        Voir
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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
              <h3 className="text-xl font-bold text-red-800">Supprimer mon compte</h3>
              <p className="text-sm text-red-700 leading-relaxed">
                Cette action est <strong>définitive</strong>. Toutes vos données seront supprimées (profil, inscriptions,
                sessions créées…). <br />
                <strong>Attention :</strong> {isFreePromoActive() ? "vous perdrez immédiatement votre accès Unlimited offert jusqu’au 31 mars 2027." : <>la suppression du compte entraînera la <u>résiliation immédiate de votre abonnement</u> s’il est en cours.</>}
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
                          {isFreePromoActive() ? "Vous perdrez immédiatement votre accès Unlimited offert." : "Cela résiliera immédiatement votre abonnement s’il est actif."}
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
    </div>
  );
}
