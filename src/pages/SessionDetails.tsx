import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Clock, Users, Trash2, Crown, CreditCard, CheckCircle, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SessionDetailMap from "@/components/SessionDetailMap";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const SessionDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user, hasActiveSubscription } = useAuth();
  const { toast } = useToast();
  
  const supabase = getSupabase();

  useEffect(() => {
    if (id) {
      fetchSessionDetails();
    }
  }, [id, user]);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      toast({
        title: "Paiement réussi !",
        description: "Vous êtes maintenant inscrit à cette session.",
      });
    } else if (paymentStatus === 'canceled') {
      toast({
        title: "Paiement annulé",
        description: "Votre inscription n'a pas été finalisée.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  const fetchSessionDetails = async () => {
    console.log("[SessionDetails] Fetching session details for ID:", id);
    const { data: sessionData, error } = await supabase
      .from('sessions')
      .select(`
        *,
        profiles:host_id (id, full_name, age, gender, avatar_url, city)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching session:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails de la session.",
        variant: "destructive",
      });
      return;
    }

    if (sessionData) {
      console.log("[SessionDetails] Session loaded:", sessionData);
      setSession(sessionData);
    }

    // Fetch participants
    const { data: participantsData, error: participantsError } = await supabase
      .from('enrollments')
      .select(`
        *,
        profiles:user_id (id, full_name, age, gender, avatar_url, city)
      `)
      .eq('session_id', id)
      .in('status', ['paid', 'included_by_subscription', 'confirmed']);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
    } else if (participantsData) {
      console.log("[SessionDetails] Participants loaded:", participantsData);
      setParticipants(participantsData);
      
      if (user) {
        const userEnrollment = participantsData.find(p => p.user_id === user.id);
        setIsEnrolled(!!userEnrollment);
      }
    }
  };

  const handleSubscribeOrEnroll = async () => {
    if (!user) {
      const currentPath = `/session/${id}`;
      window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
      return;
    }

    if (!session) return;

    if (hasActiveSubscription) {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from('enrollments')
          .insert({
            session_id: session.id,
            user_id: user.id,
            status: 'included_by_subscription'
          });

        if (error) throw error;

        toast({
          title: "Inscription réussie !",
          description: "Vous êtes maintenant inscrit à cette session.",
        });
        
        fetchSessionDetails();
      } catch (error: any) {
        console.error("Error enrolling:", error);
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteSession = async () => {
    if (!session || !user || session.host_id !== user.id) return;

    setIsDeleting(true);
    try {
      const { error: enrollmentsError } = await supabase
        .from('enrollments')
        .delete()
        .eq('session_id', session.id);

      if (enrollmentsError) throw enrollmentsError;

      const { error: sessionError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id)
        .eq('host_id', user.id);

      if (sessionError) throw sessionError;

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès."
      });

      navigate('/profile');
    } catch (error: any) {
      console.error('[SessionDetails] Delete error:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la session: " + error.message,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePaymentRedirect = (type: 'session' | 'subscription') => {
    if (!user) {
      const currentPath = `/session/${id}`;
      window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
      return;
    }

    if (type === 'subscription') {
      window.location.href = '/subscription';
    } else {
      // Redirection vers paiement unique pour cette session
      // Tu peux adapter l'URL selon ton système Stripe
      window.location.href = `/payment/session/${id}`;
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement de la session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isHost = user && session.host_id === user.id;
  const canSeeExactLocation = isHost || hasActiveSubscription;
  const isSessionFull = participants.length >= session.max_participants;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header avec titre et action */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{session.title}</h1>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(session.scheduled_at).toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(session.scheduled_at).toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>
            </div>
            
            {isHost && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isDeleting}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer la session</AlertDialogTitle>
                    <AlertDialogDescription>
                      Êtes-vous sûr de vouloir supprimer cette session ? 
                      Cette action est irréversible et tous les participants inscrits seront automatiquement désinscrits.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteSession}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche - Informations de session */}
          <div className="lg:col-span-1 space-y-6">
            {/* Détails de la session */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Badges informatifs */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {session.distance_km} km
                    </Badge>
                    <Badge variant={
                      session.intensity === 'marche' ? 'default' : 
                      session.intensity === 'course modérée' ? 'secondary' : 
                      'destructive'
                    }>
                      {session.intensity === 'marche' ? 'Marche' :
                       session.intensity === 'course modérée' ? 'Course modérée' :
                       'Course intensive'}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {participants.length + 1}/{session.max_participants}
                    </Badge>
                    <Badge variant={
                      session.session_type === 'women_only' ? 'secondary' :
                      session.session_type === 'men_only' ? 'secondary' :
                      'outline'
                    } className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {session.session_type === 'mixed' ? 'Mixte' :
                       session.session_type === 'women_only' ? 'Femmes uniquement' :
                       session.session_type === 'men_only' ? 'Hommes uniquement' :
                       'Mixte'}
                    </Badge>
                  </div>

                  {/* Description si disponible */}
                  {session.description && (
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-sm text-gray-600">{session.description}</p>
                    </div>
                  )}

                  {/* Organisateur */}
                  <div>
                    <h3 className="font-semibold mb-3">Organisateur</h3>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      {session.profiles?.avatar_url ? (
                        <img 
                          src={session.profiles.avatar_url} 
                          alt="Organisateur"
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {session.profiles?.full_name?.charAt(0) || 'O'}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{session.profiles?.full_name || 'Organisateur'}</p>
                        <p className="text-sm text-gray-600">
                          {session.profiles?.age} ans {session.profiles?.city && `• ${session.profiles.city}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">
                  Participants ({participants.length + 1}/{session.max_participants})
                </h3>
                
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div key={participant.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                      {participant.profiles?.avatar_url ? (
                        <img 
                          src={participant.profiles.avatar_url} 
                          alt="Participant"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {canSeeExactLocation || isHost
                            ? participant.profiles?.full_name || `Participant ${index + 1}` 
                            : `Participant ${index + 1}`
                          }
                        </p>
                        {(canSeeExactLocation || isHost) && participant.profiles?.age && (
                          <p className="text-xs text-gray-500">
                            {participant.profiles.age} ans
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions d'inscription */}
            {!isEnrolled && !isHost && (
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Rejoindre cette session</h3>
                  
                  {isSessionFull ? (
                    <div className="text-center py-6">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-gray-600 font-medium">Session complète</p>
                      <p className="text-sm text-gray-500">Cette session a atteint sa capacité maximale</p>
                    </div>
                  ) : hasActiveSubscription ? (
                    <Button 
                      onClick={handleSubscribeOrEnroll} 
                      disabled={isLoading}
                      className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Inscription...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Rejoindre gratuitement
                        </div>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      {/* Option Abonnement */}
                      <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                        <div className="flex items-center gap-2 mb-2">
                          <Crown className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold text-blue-900">Recommandé</span>
                        </div>
                        <h4 className="font-semibold mb-1">Abonnement MeetRun</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Accès illimité à toutes les sessions • Lieux exacts • Sans frais par session
                        </p>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-blue-600">9,99€/mois</span>
                          <Badge variant="secondary">Économique</Badge>
                        </div>
                        <Button 
                          onClick={() => handlePaymentRedirect('subscription')}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          <Crown className="w-4 h-4 mr-2" />
                          S'abonner
                        </Button>
                      </div>

                      {/* Option Paiement unique */}
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-1">Paiement unique</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Accès à cette session uniquement
                        </p>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold">4,50€</span>
                          <span className="text-xs text-gray-500">une fois</span>
                        </div>
                        <Button 
                          variant="outline"
                          onClick={() => handlePaymentRedirect('session')}
                          className="w-full"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Payer maintenant
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {(isEnrolled || isHost) && (
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="text-center py-4">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" />
                    <p className="font-semibold text-green-700">
                      {isHost ? "Vous êtes l'organisateur" : "Vous participez à cette session"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Rendez-vous au point de départ à l'heure prévue
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne droite - Carte proéminente */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm h-full">
              <CardContent className="p-0 h-full min-h-[600px]">
                <div className="h-full relative">
                  <SessionDetailMap
                    startLat={session.start_lat}
                    startLng={session.start_lng}
                    endLat={session.end_lat}
                    endLng={session.end_lng}
                    startPlace={session.start_place}
                    endPlace={session.end_place}
                    canSeeExactLocation={canSeeExactLocation}
                    blurRadiusM={session.blur_radius_m}
                    routePolyline={hasActiveSubscription ? session.route_polyline : null}
                    className="h-full rounded-lg"
                  />
                  
                  {/* Overlay d'information sur la carte */}
                  <div className="absolute top-4 left-4 right-4">
                    <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg">
                      <h3 className="font-semibold mb-2">Lieu de rendez-vous</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium">Départ: </span>
                            {canSeeExactLocation 
                              ? session.location_hint || session.start_place || "Coordonnées exactes disponibles"
                              : `Zone approximative (rayon ${session.blur_radius_m || 1000}m)`
                            }
                          </div>
                        </div>
                        {(session.end_lat && session.end_lng) && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium">Arrivée: </span>
                              {session.end_place || "Point d'arrivée défini"}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {!canSeeExactLocation && (
                        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                          💡 Abonnez-vous pour voir le lieu exact et l'itinéraire complet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionDetails;