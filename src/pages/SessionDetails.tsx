import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { MapPin, Calendar, Clock, Users, Share2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import StripeBuyButton from "@/components/StripeBuyButton";
import StripeSessionButton from "@/components/StripeSessionButton";
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

    // Fetch participants (both paid and subscription-based)
    console.log("[SessionDetails] Fetching participants for session:", id);
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
      
      // Check if current user is enrolled
      if (user) {
        const userEnrollment = participantsData.find(p => p.user_id === user.id);
        setIsEnrolled(!!userEnrollment);
        console.log("[SessionDetails] User enrollment status:", !!userEnrollment);
      }
    }
  };

  const handleSubscribeOrEnroll = async () => {
    console.log("handleSubscribeOrEnroll called", { user: !!user, hasActiveSubscription });
    
    if (!user) {
      // Redirect to auth page with return parameter
      const currentPath = `/session/${id}`;
      console.log("Redirecting to auth", { currentPath });
      window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
      return;
    }

    if (!session) return;

    // If user has active subscription, enroll directly
    if (hasActiveSubscription) {
      console.log("User has active subscription, enrolling directly");
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
        
        // Refresh session details
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
    } else {
      // Redirect to subscription page
      console.log("User doesn't have subscription, redirecting to subscription page");
      window.location.href = '/subscription';
    }
  };

  const handleDeleteSession = async () => {
    if (!session || !user || session.host_id !== user.id) return;

    setIsDeleting(true);
    try {
      console.log("[SessionDetails] Deleting session:", session.id);
      
      // Delete enrollments first
      const { error: enrollmentsError } = await supabase
        .from('enrollments')
        .delete()
        .eq('session_id', session.id);

      if (enrollmentsError) {
        console.error('[SessionDetails] Error deleting enrollments:', enrollmentsError);
        throw enrollmentsError;
      }

      // Then delete the session
      const { error: sessionError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id)
        .eq('host_id', user.id); // Security: only delete own sessions

      if (sessionError) {
        console.error('[SessionDetails] Error deleting session:', sessionError);
        throw sessionError;
      }

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès."
      });

      // Redirect to profile or home
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

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-4">
          <div className="text-center">Chargement...</div>
        </div>
      </div>
    );
  }

  // Check if user is host
  const isHost = user && session.host_id === user.id;
  
  // Check if user can see exact location (subscription-based now)
  const canSeeExactLocation = isHost || hasActiveSubscription;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 space-y-6 main-content">
        {/* Main session info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-xl font-bold text-sport-black mb-2">{session.title}</h1>
                <p className="text-sport-gray flex items-center gap-1">
                  <MapPin size={16} />
                  {canSeeExactLocation
                    ? (session.start_place || `${session.start_lat}, ${session.start_lng}`)
                    : `Zone approximative (${session.blur_radius_m || 1000}m)`
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isHost && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isDeleting}>
                        <Trash2 size={16} />
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
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Tarif</div>
                  <div>
                    {hasActiveSubscription ? (
                      <>Inclus avec l'abonnement</>
                    ) : (
                      <>4,50 € <span className="text-muted-foreground">(gratuit avec l'abonnement)</span></>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
              <span className="flex items-center gap-1">
                <Calendar size={16} />
                {new Date(session.scheduled_at).toLocaleDateString('fr-FR')}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={16} />
                {new Date(session.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex items-center gap-1">
                <Users size={16} />
                {participants.length + 1}/{session.max_participants} participants
              </span>
            </div>

            <div className="flex gap-2 mb-6">
              <Badge variant="secondary">{session.distance_km} km</Badge>
              <Badge variant={
                session.intensity === 'marche' ? 'default' : 
                session.intensity === 'course modérée' ? 'secondary' : 
                'destructive'
              }>
                {session.intensity}
              </Badge>
              <Badge variant="outline">{session.type}</Badge>
            </div>
            
            {!isEnrolled && !isHost && participants.length < session.max_participants ? (
              hasActiveSubscription ? (
                <Button size="lg" className="w-full" onClick={handleSubscribeOrEnroll} disabled={isLoading}>
                  {isLoading ? "Inscription en cours..." : "Rejoindre maintenant"}
                </Button>
              ) : (
                <div className="space-y-4">
                  {!user ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">Paiement unique</div>
                          <Button 
                            size="lg" 
                            className="w-full"
                            onClick={() => {
                              const currentPath = `/session/${id}`;
                              window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
                            }}
                          >
                            Rejoindre pour 4,50 €
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">Abonnement</div>
                          <Button 
                            variant="outline" 
                            size="lg" 
                            className="w-full"
                            onClick={() => {
                              const currentPath = `/session/${id}`;
                              window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
                            }}
                          >
                            S'abonner (illimité)
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Connectez-vous pour continuer</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">Paiement unique</div>
                          <StripeSessionButton />
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">Abonnement illimité</div>
                          <StripeBuyButton />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">
                        Paiement unique de 4,50 € ou abonnement pour un accès illimité
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : isEnrolled ? (
              <Button variant="outline" size="lg" className="w-full" disabled>
                ✓ Vous êtes inscrit(e)
              </Button>
            ) : isHost ? (
              <Button variant="outline" size="lg" className="w-full" disabled>
                ✓ Vous êtes l'organisateur
              </Button>
            ) : (
              <Button variant="ghost" size="lg" className="w-full" disabled>
                Session complète
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3">Parcours</h3>
            <div className="space-y-4">
              <SessionDetailMap
                startLat={session.start_lat}
                startLng={session.start_lng}
                endLat={session.end_lat}
                endLng={session.end_lng}
                startPlace={session.start_place}
                endPlace={session.end_place}
                canSeeExactLocation={canSeeExactLocation}
                blurRadiusM={session.blur_radius_m}
                className="h-64"
              />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-sport-gray">
                  <MapPin size={14} className="text-green-500" />
                  <span className="font-medium">Départ:</span>
                  {canSeeExactLocation 
                    ? session.location_hint || session.start_place || "Coordonnées exactes disponibles"
                    : `Zone approximative (${session.blur_radius_m || 1000}m) - Abonnez-vous pour voir le lieu exact`
                  }
                </div>
                {(session.end_lat && session.end_lng) && (
                  <div className="flex items-center gap-2 text-sm text-sport-gray">
                    <MapPin size={14} className="text-red-500" />
                    <span className="font-medium">Arrivée:</span>
                    {session.end_place || "Point d'arrivée"}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Participants */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Participants ({participants.length + 1}/{session.max_participants})</h3>
            <div className="space-y-3">
              {/* Host */}
              <div className="flex items-center justify-between p-3 bg-sport-light rounded-lg">
                <div className="flex items-center gap-3">
                  {session.profiles?.avatar_url ? (
                    <img 
                      src={session.profiles.avatar_url} 
                      alt="Host avatar"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
                      {session.profiles?.full_name?.charAt(0) || 'H'}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{session.profiles?.full_name || 'Organisateur'}</p>
                    <p className="text-sm text-sport-gray">
                      {canSeeExactLocation || isHost
                        ? `${session.profiles?.age || '?'} ans, ${session.profiles?.gender || '?'}` 
                        : `${session.profiles?.age || '?'} ans`
                      }
                    </p>
                  </div>
                </div>
                <Badge variant="default">Organisateur</Badge>
              </div>
              
              {/* Participants */}
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {participant.profiles?.avatar_url ? (
                      <img 
                        src={participant.profiles.avatar_url} 
                        alt="Participant avatar"
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-sport-secondary rounded-full flex items-center justify-center text-white font-semibold">
                        {participant.profiles?.full_name?.charAt(0) || 'P'}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        {canSeeExactLocation || isHost
                          ? participant.profiles?.full_name || 'Participant' 
                          : 'Participant'
                        }
                      </p>
                      {(canSeeExactLocation || isHost) && (
                        <p className="text-sm text-sport-gray">
                          {participant.profiles?.age || '?'} ans, {participant.profiles?.gender || '?'}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline">Confirmé</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SessionDetails;