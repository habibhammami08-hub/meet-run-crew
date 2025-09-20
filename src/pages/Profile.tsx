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
import { Calendar, MapPin, Trash2, Users, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

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

type GalleryItem = { url: string; path: string };

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
  const [gender, setGender] = useState<"homme" | "femme" | "">("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel" | "Confirmé" | "Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Galerie
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const supabase = getSupabase();

  // Refs / cleanup
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Redirection + premier chargement
  useEffect(() => {
    if (user === null) {
      navigate('/auth?returnTo=/profile');
      return;
    }
    if (user === undefined) return;
    if (user && loading && mountedRef.current) {
      loadProfile(user.id);
    }
  }, [user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sessions (inchangé logique)
  const fetchMySessions = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
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
      if (error || !sessions) return;

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
            } as Session;
          } catch {
            return {
              ...session,
              current_participants: 1
            } as Session;
          }
        })
      );

      const valid = sessionsWithCounts.filter(Boolean) as Session[];
      if (mountedRef.current) setMySessions(valid);
    } catch (err) {
      if (mountedRef.current) console.error('[Profile] Error fetching sessions:', err);
    }
  }, [supabase]);

  // Stats (inchangé logique)
  const updateProfileStats = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;
    try {
      const [{ count: sessionsHosted }, { count: sessionsJoined }] = await Promise.all([
        supabase.from('sessions').select('*', { count: 'exact' }).eq('host_id', userId).eq('status', 'published'),
        supabase.from('enrollments').select('*', { count: 'exact' }).eq('user_id', userId).in('status', ['paid', 'included_by_subscription', 'confirmed'])
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
    } catch (err) {
      if (mountedRef.current) console.error('[Profile] Error updating stats:', err);
    }
  }, [supabase]);

  // Galerie: lister les images du dossier avatars/{userId}
  const refreshGallery = useCallback(async (userId: string, mainAvatarUrl?: string | null) => {
    if (!supabase || !mountedRef.current) return;
    try {
      const folder = `avatars/${userId}`;
      const { data: files, error } = await supabase.storage
        .from('avatars')
        .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } as any });

      if (error) throw error;
      if (!files) return;

      const items: GalleryItem[] = [];
      for (const f of files) {
        if (!/(png|jpg|jpeg|webp|gif|avif)$/i.test(f.name)) continue;
        const path = `${folder}/${f.name}`;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        if (data?.publicUrl) items.push({ url: data.publicUrl, path });
      }

      let ordered = items;
      // avatar_url en premier si présent
      if (mainAvatarUrl) {
        ordered = items.sort((a, b) => (a.url === mainAvatarUrl ? -1 : b.url === mainAvatarUrl ? 1 : 0));
      }

      if (mountedRef.current) {
        setGallery(ordered);
        setActiveIndex(0);
      }
    } catch (err) {
      console.warn('[Profile] Galerie non disponible:', err);
    }
  }, [supabase]);

  // Chargement du profil (inchangé logique)
  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase || !mountedRef.current) { setLoading(false); return; }

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
        toast({
          title: "Erreur",
          description: "Impossible de charger le profil",
          variant: "destructive"
        });
      } else if (profileData) {
        setProfile(profileData as Profile);
        setFullName(profileData.full_name || "");
        setAge(profileData.age ?? "");
        setCity(profileData.city || "");
        setGender(profileData.gender ?? "");
        await refreshGallery(userId, profileData.avatar_url);
      } else {
        const { data: newProfile } = await supabase
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

        if (newProfile) {
          setProfile(newProfile as Profile);
          setFullName(newProfile.full_name || "");
          setAge(newProfile.age ?? "");
          setCity(newProfile.city || "");
          setGender(newProfile.gender ?? "");
          await refreshGallery(userId, newProfile.avatar_url);
        }
      }

      if (signal.aborted || !mountedRef.current) return;

      await Promise.all([
        fetchMySessions(userId),
        updateProfileStats(userId)
      ]);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
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
  }, [supabase, user, toast, fetchMySessions, updateProfileStats, refreshGallery]);

  // Suppression d'une session (inchangé)
  const handleDeleteSession = async (sessionId: string) => {
    if (!supabase || !user?.id || !mountedRef.current) return;

    setDeletingSession(sessionId);
    try {
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

      await fetchMySessions(user.id);
      updateProfileStats(user.id);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la session: " + error.message,
        variant: "destructive"
      });
    } finally {
      setDeletingSession(null);
    }
  };

  // Sauvegarde du profil (inchangé logique backend)
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
        gender: genderValue as Profile["gender"],
        avatar_url: avatarUrl
      } : null);

      setEditing(false);
      setAvatarFile(null);

      toast({
        title: "Profil mis à jour",
        description: "Vos modifications ont été sauvegardées."
      });

      // Rafraîchit la galerie si l'avatar a changé
      await refreshGallery(user.id, avatarUrl);
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue: " + err.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }

  // Upload multi-photos (galerie) — sans ajouter de backend
  const handleAddGalleryPhotos = async (files: FileList | null) => {
    if (!files || !supabase || !user?.id) return;
    const toUpload = Array.from(files).filter(f => /^image\//.test(f.type));
    if (toUpload.length === 0) return;

    try {
      await Promise.all(toUpload.map(async (file, idx) => {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `avatars/${user.id}/photo_${Date.now()}_${idx}.${ext}`;
        const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: false });
        if (error) throw error;
      }));
      toast({ title: "Photos ajoutées", description: `${toUpload.length} photo(s) ajoutée(s) à votre galerie.` });
      await refreshGallery(user.id, profile?.avatar_url);
    } catch (err: any) {
      toast({ title: "Erreur", description: `Échec d'upload: ${err.message}`, variant: "destructive" });
    } finally {
      if (galleryInputRef.current) galleryInputRef.current.value = ""; // reset input
    }
  };

  // Suppression photo galerie
  const handleDeletePhoto = async (idx: number) => {
    const item = photos[idx];
    if (!item) return;
    try {
      if (item.path) {
        await supabase.storage.from('avatars').remove([item.path]);
      }
      const next = photos.filter((_, i) => i !== idx) as GalleryItem[];
      setGallery(next);
      setActiveIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
      toast({ title: 'Photo supprimée', description: 'Votre photo a été supprimée.' });
    } catch (err: any) {
      toast({ title: 'Erreur', description: `Suppression impossible: ${err.message}`, variant: 'destructive' });
    }
  };

  // DnD (réordonnancement frontend uniquement)
  const dragSrc = useRef<number | null>(null);
  const onDragStart = (i: number) => (e: React.DragEvent) => { dragSrc.current = i; e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (i: number) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSrc.current; if (src === null || src === i) return;
    const next = [...photos];
    const [moved] = next.splice(src, 1);
    next.splice(i, 0, moved);
    setGallery(next.filter(p => p.path || p.url) as GalleryItem[]);
    setActiveIndex(i);
    dragSrc.current = null;
  };

  // Cleanup strict
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

  // Auth/loading
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

  // Photos (avatar prioritaire si aucune autre)
  const photos: GalleryItem[] = gallery.length > 0
    ? gallery
    : (profile.avatar_url ? [{ url: profile.avatar_url, path: '' }] : []);

  const handleQuickAdd = () => galleryInputRef.current?.click();

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-0 md:p-6">
          <div className="flex items-start justify-between px-6 pt-6 mb-4">
            <h1 className="text-2xl font-bold">Mon Profil</h1>
            {!editing && (
              <Button onClick={() => setEditing(true)}>
                Modifier
              </Button>
            )}
          </div>

          {/* UNIQUEMENT la barre d’action + grille 5 photos (pas de carrousel) */}
          <div className="px-0 md:px-6 pb-6">
            {/* Barre action: bouton caméra */}
            <div className="flex items-center justify-center gap-3 mt-1">
              <Button variant="secondary" size="sm" onClick={handleQuickAdd}>
                <Camera className="w-4 h-4 mr-1" /> Ajouter une photo
              </Button>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleAddGalleryPhotos(e.target.files)}
              />
            </div>

            {/* Grille 5 slots avec DnD + suppression en mode édition */}
            <div className="mt-4 grid grid-cols-5 gap-2 max-w-3xl mx-auto">
              {Array.from({ length: 5 }).map((_, i) => {
                const item = photos[i];
                return (
                  <div
                    key={i}
                    className={`relative aspect-square rounded-lg overflow-hidden ${item ? 'bg-muted/30' : 'bg-muted/60'} ${editing ? 'cursor-move' : ''}`}
                    draggable={editing && !!item}
                    onDragStart={editing ? onDragStart(i) : undefined}
                    onDragOver={editing ? onDragOver(i) : undefined}
                    onDrop={editing ? onDrop(i) : undefined}
                  >
                    {item ? (
                      <>
                        <img
                          src={item.url}
                          alt={`slot-${i}`}
                          className="w-full h-full object-cover"
                          onClick={() => setActiveIndex(i)}
                        />
                        {editing && (
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(i)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white"
                            aria-label="Supprimer la photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={editing ? handleQuickAdd : undefined}
                        className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Ajouter une photo"
                      >
                        <Camera className="w-6 h-6 mb-1" />
                        <span className="text-xs">Ajouter</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {editing ? (
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Nom complet</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Votre nom complet"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="sport-level">Niveau sportif</Label>
                <Select value={sportLevel} onValueChange={(value: "Occasionnel" | "Confirmé" | "Athlète") => setSportLevel(value)}>
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

              {/* Avatar principal (inchangé) */}
              <div className="space-y-2">
                <Label htmlFor="avatar">Photo de profil (principale)</Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">
                  Astuce : utilisez la galerie pour ajouter plusieurs photos sans modifier l'avatar principal.
                </p>
              </div>

              {/* Aperçu miniatures (optionnel) */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {photos.map((p, i) => (
                    <img
                      key={p.url + i}
                      src={p.url}
                      alt={`mini-${i}`}
                      className={`h-24 w-full object-cover rounded-md ${i === activeIndex ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setActiveIndex(i)}
                    />
                  ))}
                </div>
              )}

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
            <div className="px-6 pb-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">{profile.full_name}</h2>
                  {(profile.age || profile.gender) && (
                    <p className="text-muted-foreground">
                      {profile.age ? `${profile.age} ans` : null}
                      {profile.age && profile.gender ? ' · ' : ''}
                      {profile.gender ? (profile.gender === 'homme' ? 'Homme' : 'Femme') : null}
                    </p>
                  )}
                  {profile.city && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="w-4 h-4" /> {profile.city}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <div className="text-2xl font-bold text-primary">{profile.sessions_hosted || 0}</div>
                  <div className="text-sm text-muted-foreground">Sessions organisées</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <div className="text-2xl font-bold text-primary">{profile.sessions_joined || 0}</div>
                  <div className="text-sm text-muted-foreground">Sessions participées</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <div className="text-2xl font-bold text-primary">{profile.total_km || 0}</div>
                  <div className="text-sm text-muted-foreground">Kilomètres parcourus</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mes Sessions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Mes Sessions ({mySessions.length})
          </h2>

          {mySessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Vous n'avez pas encore organisé de sessions.</p>
              <Button onClick={() => navigate('/create')} className="mt-4">
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
                        {session.distance_km && <span>{session.distance_km} km</span>}
                        {session.intensity && <Badge variant="secondary">{session.intensity}</Badge>}
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

      {/* Gestion du compte */}
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
