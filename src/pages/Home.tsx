import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Shield, ArrowRight, Calendar, Clock, Star, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import heroImage from "@/assets/hero-running.jpg";
import { useToast } from "@/hooks/use-toast";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserActivity();
    }
  }, [user]);

  const fetchUserActivity = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Récupérer les sessions créées par l'utilisateur
      const { data: createdSessions } = await supabase
        .from('sessions')
        .select(`
          *,
          enrollments(count)
        `)
        .eq('host_id', user.id)
        .order('date', { ascending: false })
        .limit(3);

      // Récupérer les sessions auxquelles l'utilisateur est inscrit
      const { data: enrolledSessions } = await supabase
        .from('enrollments')
        .select(`
          *,
          sessions(*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

      // Combiner les activités avec un type
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

      // Trier par date
      activities.sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
      
      setUserActivity(activities.slice(0, 5));
    } catch (error) {
      console.error('Erreur lors du chargement des activités:', error);
    } finally {
      setLoading(false);
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

      // Actualiser les activités
      fetchUserActivity();
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

  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="MeetRun"
        actions={
          user ? (
            <Button variant="ghost" onClick={() => navigate("/profile")}>
              Profil
            </Button>
          ) : (
            <Button variant="sport" onClick={() => navigate("/auth")}>
              Se connecter
            </Button>
          )
        }
      />

      {/* Hero Section */}
      <div className="relative h-[50vh] overflow-hidden mt-16">
        <img 
          src={heroImage} 
          alt="MeetRun - Running collectif" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-6">
          <h1 className="text-4xl font-bold mb-2 text-center">MeetRun</h1>
          <p className="text-lg opacity-90 mb-6 text-center">L'application de running collectif à Wellington</p>
          <div className="flex flex-col sm:flex-row gap-4">
            {user ? (
              <>
                <Button variant="sport" size="lg" onClick={() => navigate("/map")}>
                  Voir les courses
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="sportOutline" size="lg" onClick={() => navigate("/create")}>
                  Créer une course
                </Button>
              </>
            ) : (
              <>
                <Button variant="sport" size="lg" onClick={() => navigate("/auth")}>
                  Créer un compte
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="sportOutline" size="lg" onClick={() => navigate("/map")}>
                  Voir les courses
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* How it works section */}
      <div className="p-6">
        <h2 className="text-2xl font-bold text-center mb-8 text-sport-black">
          Comment ça marche ?
        </h2>
        
        <div className="space-y-6 mb-8">
          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Trouve ta course</h3>
                  <p className="text-sport-gray">Découvre les sessions de running près de chez toi sur la carte interactive.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Inscris-toi</h3>
                  <p className="text-sport-gray">Paie 4,50$ pour rejoindre une session et accéder aux détails complets.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Cours ensemble</h3>
                  <p className="text-sport-gray">Rejoins ton groupe au point de rendez-vous et profite de ta course !</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Button variant="sportSecondary" size="lg" className="w-full" onClick={() => navigate("/map")}>
          Voir toutes les courses
        </Button>
      </div>

      {/* Activity Section */}
      {user && (
        <div className="p-6 pt-0">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Star size={20} />
                Mon activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-gray-200 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : userActivity.length > 0 ? (
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
                           {new Date(activity.date).toLocaleDateString('fr-FR', {
                             day: 'numeric',
                             month: 'long'
                           })}
                         </p>
                         <p className="text-sm text-muted-foreground flex items-center gap-1">
                           <MapPin size={12} />
                           {activity.area_hint || 'Localisation masquée'}
                           {activity.activity_type === 'created' && activity.enrollments && (
                             <span className="ml-2 flex items-center gap-1">
                               <Users size={12} />
                               {activity.enrollments[0]?.count || 0}/{activity.max_participants}
                             </span>
                           )}
                         </p>
                       </div>
                    </div>
                  ))}
                  <Button 
                    variant="ghost" 
                    className="w-full mt-2" 
                    onClick={() => navigate("/profile")}
                  >
                    Voir tout l'historique
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Star size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Aucune activité récente</p>
                  <p className="text-sm">Rejoignez ou créez votre première course !</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      
    </div>
  );
};

export default Home;