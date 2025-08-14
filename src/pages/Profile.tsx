import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import { Edit, MapPin, Calendar, Users, Star, Award, Save, X, Trash2, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger le profil",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setProfile(data);
      } else {
        // Create a default profile if none exists
        const defaultProfile = {
          id: user.id,
          email: user.email || '',
          first_name: '',
          last_name: '',
          full_name: '',
          age: null,
          gender: '',
          phone: '',
          avatar_url: null
        };
        setProfile(defaultProfile);
      }
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    }
  };

  const fetchUserStats = async () => {
    if (!user) return;
    
    // Sessions créées
    const { count: created } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('host_id', user.id);

    // Sessions rejointes (payées)
    const { count: joined } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'paid');

    // Total km (approximatif basé sur les sessions rejointes)
    const { data: sessionsData } = await supabase
      .from('enrollments')
      .select(`
        sessions(distance_km)
      `)
      .eq('user_id', user.id)
      .eq('status', 'paid');

    const totalKm = sessionsData?.reduce((sum, enrollment) => {
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
    
    try {
      // Sessions créées par l'utilisateur
      const { data: createdSessions, error: createdError } = await supabase
        .from('sessions')
        .select(`
          id,
          title,
          date,
          area_hint,
          distance_km,
          type,
          intensity,
          created_at,
          max_participants
        `)
        .eq('host_id', user.id)
        .order('date', { ascending: false })
        .limit(10);

      if (createdError) {
        console.error('Error fetching created sessions:', createdError);
      }

      // Sessions auxquelles l'utilisateur s'est inscrit
      const { data: enrolledSessions, error: enrolledError } = await supabase
        .from('enrollments')
        .select(`
          status,
          created_at,
          sessions!inner(
            id,
            title,
            date,
            area_hint,
            distance_km,
            type,
            intensity
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (enrolledError) {
        console.error('Error fetching enrolled sessions:', enrolledError);
      }

      const activities = [];
      
      // Ajouter les sessions créées
      if (createdSessions) {
        activities.push(...createdSessions.map(session => ({
          ...session,
          activity_type: 'created',
          activity_date: session.created_at
        })));
      }
      
      // Ajouter les sessions rejointes
      if (enrolledSessions) {
        activities.push(...enrolledSessions.map(enrollment => ({
          ...enrollment.sessions,
          enrollment_status: enrollment.status,
          activity_type: 'joined',
          activity_date: enrollment.created_at
        })));
      }

      // Trier par date décroissante
      activities.sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
      setUserActivity(activities.slice(0, 10)); // Limiter à 10 activités
    } catch (error) {
      console.error('Unexpected error fetching user activity:', error);
    }
  };

  async function saveProfile(formValues: any) {
    console.log("[profile] Starting profile update for user:", user?.id);
    if (!user?.id) {
      console.error("[profile] No user");
      toast({
        title: "Erreur",
        description: "Tu dois être connecté pour enregistrer ton profil.",
        variant: "destructive",
      });
      return;
    }

    // Coercitions de types pour éviter 400 silencieux
    const payload = {
      id: user.id,                                       // CRUCIAL pour onConflict:'id'
      email: user.email || '',                           // Requis par le schéma
      full_name: (formValues.full_name ?? "").toString().slice(0, 120),
      avatar_url: formValues.avatar_url ?? null,
      phone: formValues.phone ?? null,
      age: formValues.age !== "" && formValues.age != null ? Number(formValues.age) : null,
      gender: formValues.gender ?? null,
    };
    console.log("[profile] Payload prepared:", payload);

    setLoading(true);
    try {
      console.log("[profile] Testing connection first...");
      // Test connection first
      const { data: testData, error: testError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();
      
      console.log("[profile] Connection test result:", { testData, testError });
      
      if (testError && testError.code !== 'PGRST116') {
        throw new Error(`Connection failed: ${testError.message}`);
      }

      console.log("[profile] Connection OK, attempting update instead of upsert...");
      // Try update first, then insert if not exists
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id)
        .select()
        .single();

      console.log("[profile] update result:", { data, error });
      if (error) {
        console.error("[profile] upsert error:", error);
        toast({
          title: "Erreur",
          description: `Impossible d'enregistrer le profil (${error.code ?? "err"}) - ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      console.log("[profile] upsert success, updating local state");
      setProfile(data);
      setIsEditing(false);
      toast({
        title: "Succès",
        description: "Profil mis à jour !",
      });
    } catch (e) {
      console.error("[profile] crash:", e);
      toast({
        title: "Erreur",
        description: "Erreur inattendue pendant l'enregistrement.",
        variant: "destructive",
      });
    } finally {
      console.log("[profile] Setting loading to false");
      setLoading(false);
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Update local state
      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      
      toast({
        title: "Photo de profil mise à jour",
        description: "Votre avatar a été mis à jour avec succès.",
      });
    } catch (error: any) {
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
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Type de fichier invalide",
          description: "Veuillez sélectionner une image.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Fichier trop volumineux",
          description: "La taille maximum est de 5MB.",
          variant: "destructive",
        });
        return;
      }
      
      uploadAvatar(file);
    }
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
        .eq('id', sessionId);

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
      
      <div className="p-4 space-y-6">
        {/* User info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            {isEditing ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const firstName = (formData.get('first_name') as string)?.trim() || '';
                const lastName = (formData.get('last_name') as string)?.trim() || '';
                const formValues = {
                  full_name: `${firstName} ${lastName}`.trim(),
                  age: formData.get('age'),
                  gender: formData.get('gender'),
                  phone: formData.get('phone'),
                  avatar_url: profile?.avatar_url
                };
                console.log("[profile] FormValues collected:", formValues);
                saveProfile(formValues);
              }}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="first_name">Prénom *</Label>
                      <Input
                        id="first_name"
                        name="first_name"
                        defaultValue={profile?.first_name || ''}
                        required
                        placeholder="Votre prénom"
                      />
                    </div>
                    <div>
                      <Label htmlFor="last_name">Nom *</Label>
                      <Input
                        id="last_name"
                        name="last_name"
                        defaultValue={profile?.last_name || ''}
                        required
                        placeholder="Votre nom"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Adresse email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      L'adresse email ne peut pas être modifiée
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="age">Âge</Label>
                      <Input
                        id="age"
                        name="age"
                        type="number"
                        defaultValue={profile?.age || ''}
                        min="16"
                        max="99"
                        placeholder="Votre âge"
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
                       placeholder="Votre numéro de téléphone"
                     />
                   </div>
                  
                  <div className="flex gap-2">
                    <Button type="submit" variant="sport" disabled={loading} className="flex-1">
                      {loading ? "Sauvegarde..." : "Sauvegarder"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                      disabled={loading}
                    >
                      Annuler
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
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-xl font-bold text-sport-black">
                      {profile?.first_name || profile?.last_name 
                        ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
                        : profile?.full_name || 'Nom non renseigné'}
                    </h1>
                    {profile?.age && profile?.gender && (
                      <p className="text-sport-gray">{profile.age} ans • {profile.gender}</p>
                    )}
                    {profile?.phone && (
                      <p className="text-sport-gray">📞 {profile.phone}</p>
                    )}
                    <p className="text-sport-gray">✉️ {user.email}</p>
                    
                    {!isEditing && (!profile?.first_name || !profile?.last_name) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit size={14} className="mr-1" />
                        Compléter le profil
                      </Button>
                    )}
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
                      activity.enrollment_status === 'paid' ? 'bg-green-500' : 'bg-blue-500'
                    }`}></div>
                     <div className="flex-1">
                       <div className="flex justify-between items-start mb-1">
                         <h4 className="font-medium">{activity.title}</h4>
                         <div className="flex items-center gap-2">
                           <Badge variant={
                             activity.activity_type === 'created' ? 'default' :
                             activity.enrollment_status === 'paid' ? 'secondary' : 'outline'
                           } className="text-xs">
                             {activity.activity_type === 'created' ? 'Organisée' : 
                              activity.enrollment_status === 'paid' ? 'Payée' : 'Inscrite'}
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
                               <Trash2 size={12} />
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

        <div className="space-y-3">
          <Button 
            variant="ghost" 
            size="lg" 
            className="w-full text-destructive"
            onClick={signOut}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;