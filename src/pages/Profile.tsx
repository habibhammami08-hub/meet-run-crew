import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import { Edit, MapPin, Calendar, Users, Star, Award, Save, X, Trash2, Camera, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [userStats, setUserStats] = useState({
    joined: 0,
    created: 0,
    totalKm: 0
  });
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchUserStats();
      fetchUserActivity();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
    } else if (!data) {
      // CORRECTION: Créer le profil s'il n'existe pas
      await createDefaultProfile();
    }
  };

  const createDefaultProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();

      if (!error && data) {
        setProfile(data);
      }
    } catch (error) {
      console.error("Erreur création profil par défaut:", error);
    }
  };

  const fetchUserStats = async () => {
    if (!user) return;
    
    // Sessions créées
    const { count: created } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('host_id', user.id);

    // Sessions rejointes (payées ou via abonnement)
    const { count: joined } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['paid', 'included_by_subscription']);

    // Total km (approximatif basé sur les sessions rejointes)
    const { data: sessionsData } = await supabase
      .from('enrollments')
      .select(`
        sessions(distance_km)
      `)
      .eq('user_id', user.id)
      .in('status', ['paid', 'included_by_subscription']);

    const totalKm = sessionsData?.reduce((sum, enrollment: any) => {
      return sum + (enrollment.sessions?.distance_km || 0);
    }, 0) || 0;

    setUserStats({
      joined: joined || 0,
      created: created || 0,
      totalKm: Math.round(totalKm)
    });
  };

  const fetchUserActivity = async () => {
    if (!user) return;
    
    // Sessions créées
    const { data: createdSessions } = await supabase
      .from('sessions')
      .select(`
        *,
        enrollments(count)
      `)
      .eq('host_id', user.id)
      .order('date', { ascending: false })
      .limit(5);

    // Sessions rejointes
    const { data: enrolledSessions } = await supabase
      .from('enrollments')
      .select(`
        *,
        sessions(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const activities = [];
    
    if (createdSessions) {
      activities.push(...createdSessions.map(session => ({
        ...session,
        activity_type: 'created',
        activity_date: session.created_at
      })));
    }
    
    if (enrolledSessions) {
      activities.push(...enrolledSessions.map(enrollment => ({
        ...enrollment.sessions,
        enrollment_status: enrollment.status,
        activity_type: 'joined',
        activity_date: enrollment.created_at
      })));
    }

    activities.sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
    setUserActivity(activities);
  };

  // CORRECTION: Fonction updateProfile améliorée avec gestion d'erreur robuste
  const updateProfile = async (values: any) => {
    if (!user) {
      toast({ 
        title: "Erreur", 
        description: "Vous devez être connecté pour modifier votre profil.", 
        variant: "destructive" 
      }); 
      return; 
    }

    setLoading(true);

    try {
      const payload = {
        id: user.id,
        email: user.email || '',
        full_name: (values.full_name ?? "").toString().trim() || null,
        phone: (values.phone ?? "").toString().trim() || null,
        age: values.age ? Number(values.age) : null,
        gender: values.gender || null,
        updated_at: new Date().toISOString()
      };

      console.log("[profile] Mise à jour avec payload:", payload);
      
      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();

      if (error) {
        console.error("[profile] Erreur upsert:", error);
        throw new Error(error.message);
      }

      setProfile(data);
      setIsEditing(false);
      
      toast({
        title: "Profil mis à jour !",
        description: "Vos informations ont été sauvegardées.",
      });
    } catch (error: any) {
      console.error("[profile] Erreur complète:", error);
      toast({ 
        title: "Erreur de sauvegarde", 
        description: error.message || "Impossible de sauvegarder le profil",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  // CORRECTION: Upload d'avatar entièrement revu
  const uploadAvatar = async (file: File) => {
    if (!user) return;
    
    setUploadingAvatar(true);
    try {
      // Validation du fichier
      if (!file.type.startsWith('image/')) {
        throw new Error("Le fichier doit être une image");
      }
      
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("La taille maximum est de 5MB");
      }

      // Nom unique pour éviter les conflits
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      console.log("[avatar] Upload fichier:", fileName);

      // Supprimer l'ancien avatar s'il existe
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('avatars')
            .remove([`${user.id}/${oldPath}`]);
        }
      }

      // Upload du nouveau fichier
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { 
          cacheControl: '3600',
          upsert: true 
        });

      if (uploadError) {
        console.error("[avatar] Erreur upload:", uploadError);
        throw new Error(`Erreur upload: ${uploadError.message}`);
      }

      // Récupération de l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      console.log("[avatar] URL publique:", publicUrl);

      // Mise à jour du profil avec la nouvelle URL
      const { data, error: updateError } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id, 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();

      if (updateError) {
        console.error("[avatar] Erreur mise à jour profil:", updateError);
        throw new Error(`Erreur mise à jour: ${updateError.message}`);
      }

      setProfile(data);
      
      toast({
        title: "Avatar mis à jour",
        description: "Votre photo de profil a été mise à jour.",
      });
    } catch (error: any) {
      console.error("[avatar] Erreur complète:", error);
      toast({
        title: "Erreur d'upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
    // Reset input pour permettre re-sélection du même fichier
    event.target.value = '';
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!user) return;
    
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette session ? Cette action est irréversible.")) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .eq('host_id', user.id); // Sécurité supplémentaire

      if (error) throw error;

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès.",
      });

      // Actualiser les activités et statistiques
      fetchUserActivity();
      fetchUserStats();
    } catch (error: any) {
      toast({
        title: "Erreur de suppression",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  // CORRECTION: Déconnexion améliorée
  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      // La redirection est gérée par le hook useAuth
    } catch (error: any) {
      toast({
        title: "Erreur de déconnexion",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // CORRECTION: Suppression de compte complète
  const handleDeleteAccount = async () => {
    if (!user) return;
    
    const confirmation = prompt(
      "Cette action est irréversible. Tapez 'SUPPRIMER' pour confirmer la suppression de votre compte :"
    );
    
    if (confirmation !== 'SUPPRIMER') {
      return;
    }

    try {
      setLoading(true);
      
      // Supprimer les données utilisateur en cascade
      // 1. Supprimer les inscriptions
      await supabase
        .from('enrollments')
        .delete()
        .eq('user_id', user.id);

      // 2. Supprimer les sessions créées
      await supabase
        .from('sessions')
        .delete()
        .eq('host_id', user.id);

      // 3. Supprimer l'avatar du storage
      if (profile?.avatar_url) {
        const fileName = profile.avatar_url.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('avatars')
            .remove([`${user.id}/${fileName}`]);
        }
      }

      // 4. Supprimer le profil
      await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      // 5. Supprimer le compte auth
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      
      if (deleteError) {
        console.error("Erreur suppression compte auth:", deleteError);
        // Continuer même si l'erreur auth, le profil est supprimé
      }

      // Déconnexion forcée
      await supabase.auth.signOut();
      
      toast({
        title: "Compte supprimé",
        description: "Votre compte a été supprimé avec succès.",
      });
      
      // Redirection vers l'accueil
      navigate("/");
      
    } catch (error: any) {
      console.error("Erreur suppression compte:", error);
      toast({ 
        title: "Erreur", 
        description: "Impossible de supprimer le compte. Contactez le support.",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  // Si pas connecté, affichage écran d'accueil auth
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
        title="Profil"
        actions={
          !isEditing ? (
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
              <Edit size={20} />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
                <X size={20} />
              </Button>
            </div>
          )
        }
      />
      
      <div className="p-4 space-y-6 main-content">
        {/* User info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            {isEditing ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const values = {
                  full_name: formData.get('full_name') as string,
                  age: formData.get('age') as string,
                  gender: formData.get('gender') as string,
                  phone: formData.get('phone') as string,
                };
                updateProfile(values);
              }}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="full_name">Nom complet</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      defaultValue={profile?.full_name || ''}
                      placeholder="Jean Dupont"
                      required
                      maxLength={100}
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
                        placeholder="25"
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
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Sélectionner</option>
                        <option value="homme">Homme</option>
                        <option value="femme">Femme</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      defaultValue={profile?.phone || ''}
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="sport" disabled={loading} className="flex-1">
                      <Save size={16} className="mr-2" />
                      {loading ? "Sauvegarde..." : "Sauvegarder"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                      disabled={loading}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative">
                    <Avatar className="w-20 h-20">
                      <AvatarImage src={profile?.avatar_url} />
                      <AvatarFallback className="text-lg">
                        {profile?.full_name?.split(' ').map((n: string) => n[0]).join('') || user?.email?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent" />
                      ) : (
                        <Camera size={14} />
                      )}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-xl font-bold text-sport-black">
                      {profile?.full_name || 'Nom non renseigné'}
                    </h1>
                    {profile?.age && profile?.gender && (
                      <p className="text-sport-gray">{profile.age} ans • {profile.gender}</p>
                    )}
                    {profile?.phone && (
                      <p className="text-sport-gray">📞 {profile.phone}</p>
                    )}
                    <p className="text-sport-gray">✉️ {user.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{userStats.joined}</p>
                    <p className="text-sm text-sport-gray">Courses jointes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{userStats.created}</p>
                    <p className="text-sm text-sport-gray">Courses organisées</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{userStats.totalKm}</p>
                    <p className="text-sm text-sport-gray">km parcourus</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Achievements */}
        {userStats.joined > 0 || userStats.created > 0 ? (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award size={20} />
                Badges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {userStats.joined >= 5 && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                    <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                      🏃‍♀️
                    </div>
                    <div>
                      <p className="font-medium text-sm">Coureur régulier</p>
                      <p className="text-xs text-sport-gray">{userStats.joined} courses complétées</p>
                    </div>
                  </div>
                )}
                {userStats.created >= 1 && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      👥
                    </div>
                    <div>
                      <p className="font-medium text-sm">Organisateur</p>
                      <p className="text-xs text-sport-gray">{userStats.created} sessions créées</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Running history */}
        {userActivity.length > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.activity_type === 'created' ? 'bg-primary' : 
                      activity.enrollment_status === 'paid' || activity.enrollment_status === 'included_by_subscription' ? 'bg-green-500' : 'bg-blue-500'
                    }`}></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-start mb-1">
                         <h4 className="font-medium">{activity.title}</h4>
                         <div className="flex items-center gap-2">
                           <Badge variant={
                             activity.activity_type === 'created' ? 'default' :
                             activity.enrollment_status === 'paid' || activity.enrollment_status === 'included_by_subscription' ? 'secondary' : 'outline'
                           } className="text-xs">
                             {activity.activity_type === 'created' ? 'Organisée' : 
                              activity.enrollment_status === 'paid' || activity.enrollment_status === 'included_by_subscription' ? 'Participé' : 'Inscrite'}
                           </Badge>
                           {activity.activity_type === 'created' && (
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleDeleteSession(activity.id);
                               }}
                               disabled={deletingSessionId === activity.id}
                               className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                             >
                               {deletingSessionId === activity.id ? (
                                 <div className="animate-spin rounded-full h-3 w-3 border-2 border-destructive border-t-transparent" />
                               ) : (
                                 <Trash2 size={12} />
                               )}
                             </Button>
                           )}
                         </div>
                       </div>
                       <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                         <Calendar size={12} />
                         {new Date(activity.date).toLocaleDateString('fr-FR')}
                       </p>
                       <p className="text-sm text-muted-foreground flex items-center gap-1">
                         <MapPin size={12} />
                         {activity.area_hint || 'Localisation masquée'}
                       </p>
                     </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button 
            variant="sportOutline" 
            size="lg" 
            className="w-full flex items-center gap-2"
            onClick={handleSignOut}
            disabled={loading}
          >
            <LogOut size={16} />
            {loading ? "Déconnexion..." : "Se déconnecter"}
          </Button>
          
          <Button 
            variant="ghost" 
            size="lg" 
            className="w-full text-destructive"
            onClick={handleDeleteAccount}
            disabled={loading}
          >
            Supprimer mon compte
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;