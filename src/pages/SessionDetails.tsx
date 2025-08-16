import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { MapPin, Calendar, Clock, Users, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import StripeBuyButton from "@/components/StripeBuyButton";

const SessionDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    const { data: sessionData, error } = await supabase
      .from('sessions')
      .select(`
        *,
        profiles:host_id (id, full_name, age, gender, avatar_url)
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
      setSession(sessionData);
    }

    // Fetch participants (both paid and subscription-based)
    const { data: participantsData } = await supabase
      .from('enrollments')
      .select(`
        *,
        profiles!enrollments_user_id_fkey (id, full_name, age, gender, avatar_url)
      `)
      .eq('session_id', id)
      .in('status', ['paid', 'included_by_subscription']);

    if (participantsData) {
      setParticipants(participantsData);
      
      // Check if current user is enrolled
      if (user) {
        const userEnrollment = participantsData.find(p => p.user_id === user.id);
        setIsEnrolled(!!userEnrollment);
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
                    ? session.area_hint || "Lieu exact disponible"
                    : `Zone approximative (${session.blur_radius_m || 1000}m)`
                  }
                </p>
              </div>
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
            
            <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
              <span className="flex items-center gap-1">
                <Calendar size={16} />
                {new Date(session.date).toLocaleDateString('fr-FR')}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={16} />
                {new Date(session.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground text-center">Accès illimité à toutes les courses</div>
                  <StripeBuyButton />
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
            <h3 className="font-semibold mb-3">Lieu de rendez-vous</h3>
            <p className="text-sm text-sport-gray flex items-center gap-1">
              <MapPin size={14} />
              {canSeeExactLocation 
                ? session.area_hint || "Coordonnées exactes disponibles"
                : `Zone approximative (${session.blur_radius_m || 1000}m) - Abonnez-vous pour voir le lieu exact`
              }
            </p>
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