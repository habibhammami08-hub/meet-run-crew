import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import { Edit, Users, X, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Charger le profil au montage
  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      const updateData = {
        full_name: formData.get('full_name') as string,
        phone: formData.get('phone') as string,
        age: formData.get('age') ? Number(formData.get('age')) : null,
        gender: formData.get('gender') as string,
      };

      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      setProfile(data);
      setIsEditing(false);
      toast.success("Profil mis à jour avec succès !");
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour du profil");
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;

    // Double confirmation pour éviter les suppressions accidentelles
    const firstConfirm = confirm(
      "⚠️ ATTENTION ⚠️\n\nVoulez-vous vraiment supprimer votre profil ?\n\nCette action supprimera :\n- Votre profil complet\n- Toutes vos sessions créées\n- Toutes vos inscriptions\n- Votre compte utilisateur\n\nCette action est IRRÉVERSIBLE !"
    );

    if (!firstConfirm) return;

    const secondConfirm = confirm(
      "Dernière confirmation :\n\nÊtes-vous absolument certain de vouloir supprimer définitivement votre compte ?\n\nTapez OUI pour confirmer ou Annuler pour abandonner."
    );

    if (!secondConfirm) return;

    setDeleting(true);
    try {
      // Appel de la fonction de suppression complète
      const { error } = await supabase.rpc('delete_user_completely');

      if (error) throw error;

      toast.success("Profil supprimé avec succès. Redirection...");
      
      // Redirection vers la page d'accueil après suppression
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error: any) {
      console.error('Error deleting profile:', error);
      toast.error("Erreur lors de la suppression du profil");
      setDeleting(false);
    }
  };

  // Si pas connecté
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header title="Profil" />
        
        <div className="p-4 pt-20">
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users size={32} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Créez votre profil</h2>
              <p className="text-muted-foreground mb-8">
                Rejoignez la communauté MeetRun pour créer et participer à des sessions de course.
              </p>
              <div className="space-y-3">
                <Button 
                  variant="sport" 
                  size="lg" 
                  className="w-full"
                  onClick={() => navigate("/auth")}
                >
                  Créer un compte
                </Button>
                <Button 
                  variant="sportOutline" 
                  size="lg" 
                  className="w-full"
                  onClick={() => navigate("/auth")}
                >
                  Se connecter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="Mon Profil"
        actions={
          !isEditing ? (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsEditing(true)}
              className="text-primary"
            >
              <Edit size={20} />
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsEditing(false)}
              className="text-muted-foreground"
            >
              <X size={20} />
            </Button>
          )
        }
      />
      
      <div className="p-4 pt-20 space-y-6">
        {!isEditing && (
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">
              Cliquez sur <Edit size={14} className="inline mx-1" /> pour modifier vos informations
            </p>
          </div>
        )}
        
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <Label htmlFor="full_name">Nom complet</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    defaultValue={profile?.full_name || ''}
                    placeholder="Votre nom complet"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={profile?.phone || ''}
                    placeholder="Votre numéro de téléphone"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="age">Âge</Label>
                    <Input
                      id="age"
                      name="age"
                      type="number"
                      defaultValue={profile?.age || ''}
                      placeholder="Votre âge"
                      min="16"
                      max="99"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">Genre</Label>
                    <select
                      id="gender"
                      name="gender"
                      defaultValue={profile?.gender || ''}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Sélectionner</option>
                      <option value="homme">Homme</option>
                      <option value="femme">Femme</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-6">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={profile?.avatar_url} />
                    <AvatarFallback className="text-lg">
                      {profile?.full_name?.split(' ').map((n: string) => n[0]).join('') || user?.email?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-semibold">{profile?.full_name || 'Nom non renseigné'}</h3>
                    <p className="text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Téléphone</Label>
                    <p className="text-sm text-muted-foreground">{profile?.phone || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Âge</Label>
                    <p className="text-sm text-muted-foreground">{profile?.age || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Genre</Label>
                    <p className="text-sm text-muted-foreground">{profile?.gender || 'Non renseigné'}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="shadow-card border-destructive/20">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-destructive mb-2">Zone de danger</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  La suppression de votre profil est irréversible et supprimera toutes vos données.
                </p>
              </div>
              <Button 
                variant="destructive" 
                onClick={handleDeleteProfile}
                disabled={deleting}
                className="w-full"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Suppression en cours...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} className="mr-2" />
                    Supprimer définitivement mon profil
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardContent className="p-6">
            <Button 
              variant="outline" 
              onClick={signOut}
              className="w-full"
            >
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;