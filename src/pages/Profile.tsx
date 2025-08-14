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
      .single();

    if (!error && data) {
      setProfile(data);
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

  const updateProfile = async (values: any) => {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user;
    if (!me) { 
      toast({ 
        title: "Erreur", 
        description: "Connecte-toi pour enregistrer.", 
        variant: "destructive" 
      }); 
      return; 
    }

    const payload = {
      id: me.id,                              // CRUCIAL pour onConflict:'id'
      full_name: (values.full_name ?? "").toString().slice(0,120) || null,
      avatar_url: values.avatar_url ?? null,
      phone: (values.phone ?? "").trim() || null,
      age: values.age ? Number(values.age) : null,
      gender: values.gender ?? null,
    };

    console.log("[profile] upsert payload:", payload);
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    console.log("[profile] upsert result:", { data, error });

    if (error) { 
      toast({ 
        title: "Erreur", 
        description: "Profil non enregistré.", 
        variant: "destructive" 
      }); 
      return; 
    }
    setProfile(data);
    setIsEditing(false);
    toast({
      title: "Profil mis à jour !",
      description: "Vos informations ont été sauvegardées.",
    });
  };

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
                const values = {
                  full_name: formData.get('full_name') as string,
                  age: formData.get('age') as string,
                  gender: formData.get('gender') as string,
                  phone: formData.get('phone') as string,
                  avatar_url: profile?.avatar_url,
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
                      required
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
                    />
                  </div>
                  <Button type="submit" variant="sport" disabled={loading}>
                    {loading ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
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
            onClick={async () => {
              if (!confirm("Supprimer définitivement votre compte ?")) return;
              try {
                const { data: sess } = await supabase.auth.getSession();
                const token = sess.session?.access_token;
                const { data, error } = await supabase.functions.invoke("delete-account", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (error) throw error;
                await supabase.auth.signOut();
                window.location.href = "/";
              } catch (e: any) {
                console.error(e);
                toast({ 
                  title: "Erreur", 
                  description: e?.message || "Suppression impossible.", 
                  variant: "destructive" 
                });
              }
            }}
          >
            Supprimer mon compte
          </Button>
          <Button 
            variant="ghost" 
            size="lg" 
            className="w-full"
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