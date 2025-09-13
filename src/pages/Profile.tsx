import { useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, Trash2 } from "lucide-react";

// --- Types minimaux ---
interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  age: number | null;
  city: string | null;
  avatar_url?: string | null;
  sessions_hosted?: number | null;
  sessions_joined?: number | null;
  total_km?: number | null;
}

interface SessionRow {
  id: string;
  title: string | null;
  description?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
}

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = getSupabase();

  // --- State ---
  const [loading, setLoading] = useState(false); // ⚠️ important: false au départ
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [createdSessions, setCreatedSessions] = useState<SessionRow[]>([]);
  const [enrolledSessions, setEnrolledSessions] = useState<SessionRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- Helpers ---
  const initials = useMemo(() => {
    if (!profile?.full_name) return "U";
    return profile.full_name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile?.full_name]);

  // --- Chargement du profil ---
  const loadProfile = useRef(async (userId: string) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, age, city, avatar_url, sessions_hosted, sessions_joined, total_km")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;

      let p = data as ProfileRow | null;
      if (!p) {
        const { data: created, error: upErr } = await supabase
          .from("profiles")
          .upsert({
            id: userId,
            email: user?.email ?? "",
            full_name: user?.email?.split("@")[0] ?? "Runner",
            sessions_hosted: 0,
            sessions_joined: 0,
            total_km: 0,
          })
          .select()
          .single();
        if (upErr) throw upErr;
        p = created as ProfileRow;
      }

      setProfile(p);
      setFullName(p.full_name ?? "");
      setAge(p.age != null ? String(p.age) : "");
      setCity(p.city ?? "");
    } catch (e: any) {
      console.error("[Profile] loadProfile error:", e);
      toast({ title: "Erreur", description: e?.message ?? "Impossible de charger le profil", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  });

  // --- Récupération des sessions ---
  const loadSessions = useRef(async (userId: string) => {
    if (!supabase) return;
    try {
      const { data: created, error: sErr } = await supabase
        .from("sessions")
        .select("id, title, description, scheduled_at, status")
        .eq("host_id", userId)
        .order("scheduled_at", { ascending: false })
        .limit(5);
      if (sErr) throw sErr;
      setCreatedSessions(created ?? []);

      const { data: enrollments, error: eErr } = await supabase
        .from("enrollments")
        .select("sessions(id, title, description, scheduled_at, status)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (eErr) throw eErr;
      const flat = (enrollments ?? [])
        .map((row: any) => row.sessions)
        .filter(Boolean) as SessionRow[];
      setEnrolledSessions(flat);
    } catch (e) {
      console.error("[Profile] loadSessions error:", e);
    }
  });

  // --- Update profil ---
  const onSave = async () => {
    if (!supabase || !user?.id || saving) return;
    setSaving(true);
    try {
      // upload avatar si présent
      let avatar_url: string | undefined = profile?.avatar_url ?? undefined;
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const path = `${user.id}/avatar.${fileExt}`;
        // supprime ancien fichier si besoin (best-effort)
        try { await supabase.storage.from("avatars").remove([path]); } catch {}
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
        avatar_url = pub.publicUrl;
      }

      const ageValue = age === "" ? null : Number(age);
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, city, age: ageValue, avatar_url })
        .eq("id", user.id);
      if (error) throw error;

      setProfile((p) => p ? { ...p, full_name: fullName, city, age: ageValue, avatar_url } : p);
      setEditing(false);
      toast({ title: "Profil mis à jour", description: "Vos informations ont été enregistrées." });
    } catch (e: any) {
      console.error("[Profile] save error:", e);
      toast({ title: "Erreur", description: e?.message ?? "Échec de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Suppression d'une session créée ---
  const deleteSession = async (sessionId: string) => {
    if (!supabase || !user?.id) return;
    if (!confirm("Supprimer cette session ?")) return;
    setDeletingId(sessionId);
    try {
      const { error } = await supabase.from("sessions").delete().eq("id", sessionId).eq("host_id", user.id);
      if (error) throw error;
      setCreatedSessions((list) => list.filter((s) => s.id !== sessionId));
      toast({ title: "Session supprimée" });
    } catch (e: any) {
      console.error("[Profile] delete session error:", e);
      toast({ title: "Erreur", description: e?.message ?? "Suppression impossible", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // --- Effets ---
  useEffect(() => {
    if (user === null) {
      navigate("/auth?returnTo=/profile");
      return;
    }
    if (user === undefined) {
      // auth en cours
      return;
    }
    if (user && !profile) {
      loadProfile.current(user.id);
      loadSessions.current(user.id);
    }
  }, [user, navigate, profile]);

  // --- Rendu ---
  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Chargement du profil…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="mb-4">Impossible de charger le profil.</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* En-tête profil */}
      <Card>
        <CardHeader>
          <CardTitle>Mon profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="text-lg font-semibold">{profile.full_name || "Runner"}</div>
              <div className="text-sm text-muted-foreground">{profile.email}</div>
              <div className="flex gap-2 mt-1">
                {profile.sessions_hosted != null && (
                  <Badge variant="secondary">Créées: {profile.sessions_hosted}</Badge>
                )}
                {profile.sessions_joined != null && (
                  <Badge variant="secondary">Rejointes: {profile.sessions_joined}</Badge>
                )}
                {profile.total_km != null && (
                  <Badge variant="secondary">Total: {profile.total_km} km</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Formulaire */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!editing} />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={!editing} />
            </div>
            <div className="space-y-2">
              <Label>Âge</Label>
              <Input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={!editing}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Avatar</Label>
              <Input type="file" accept="image/*" disabled={!editing} onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <div className="flex gap-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Modifier</Button>
            ) : (
              <>
                <Button onClick={onSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enregistrer
                </Button>
                <Button variant="secondary" onClick={() => { setEditing(false); setAvatarFile(null); setFullName(profile.full_name ?? ""); setAge(profile.age != null ? String(profile.age) : ""); setCity(profile.city ?? ""); }}>
                  Annuler
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions créées */}
      <Card>
        <CardHeader>
          <CardTitle>Mes sessions créées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {createdSessions.length === 0 && (
            <p className="text-sm text-muted-foreground">Vous n'avez pas encore créé de session.</p>
          )}
          {createdSessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{s.title || "Sans titre"}</div>
                <div className="text-xs text-muted-foreground">
                  {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "Date à définir"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/session/${s.id}`)}>Ouvrir</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteSession(s.id)} disabled={deletingId === s.id}>
                  {deletingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sessions rejointes */}
      <Card>
        <CardHeader>
          <CardTitle>Mes sessions rejointes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrolledSessions.length === 0 && (
            <p className="text-sm text-muted-foreground">Vous n'avez pas encore rejoint de session.</p>
          )}
          {enrolledSessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{s.title || "Sans titre"}</div>
                <div className="text-xs text-muted-foreground">
                  {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "Date à définir"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/session/${s.id}`)}>Ouvrir</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
