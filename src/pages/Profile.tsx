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

export default function ProfilePage() {
  const supabase = getSupabase();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel"|"Confirmé"|"Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      setLoading(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { 
          setLoading(false); 
          return; 
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, age, city, sport_level, avatar_url, sessions_hosted, sessions_joined, total_km, total_distance_hosted_km")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          setProfile({
            ...data,
            sport_level: (data.sport_level as any) || null
          });
          setFullName(data.full_name || "");
          setAge(data.age ?? "");
          setCity(data.city || "");
          setSportLevel((data.sport_level as any) || "Occasionnel");
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function handleSave() {
    if (!supabase || !profile) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let avatarUrl = profile.avatar_url || null;

      // Upload avatar si nouveau fichier
      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.id}/avatar.${ext}`;

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
          sport_level: sportLevel,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);

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
        sport_level: sportLevel,
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
              <Button onClick={() => window.location.href = '/auth'}>
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
              <div className="text-muted-foreground">Km organisés</div>
              <div className="text-xl font-bold text-primary">{(profile.total_distance_hosted_km || 0).toFixed(1)} km</div>
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
                Niveau : {profile.sport_level || "Occasionnel"}
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
                    setSportLevel((profile.sport_level as any) || "Occasionnel");
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