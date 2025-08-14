import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { MapPin, Calendar, Clock, Users, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SessionDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

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

    // Fetch participants
    const { data: participantsData } = await supabase
      .from('enrollments')
      .select(`
        *,
        profiles:user_id (id, full_name, age, gender, avatar_url)
      `)
      .eq('session_id', id)
      .eq('status', 'paid');

    if (participantsData) {
      setParticipants(participantsData);
      
      // Check if current user is enrolled
      if (user) {
        const userEnrollment = participantsData.find(p => p.user_id === user.id);
        setIsEnrolled(!!userEnrollment);
      }
    }
  };

  const handleEnroll = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Vous devez être connecté pour vous inscrire.",
        variant: "destructive",
      });
      return;
    }

    if (!session) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { sessionId: session.id }
      });

      if (error) throw error;

      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Header title="Détails de la session" />
        <div className="p-4 pt-20">
          <div className="text-center">Chargement...</div>
        </div>
        <Navigation />
      </div>
    );
  }

  // Check if user is host
  const isHost = user && session.host_id === user.id;
  
  // Check if user can see exact location
  const canSeeExactLocation = isEnrolled || isHost;

  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="Détails de la session" 
        actions={
          <Button variant="ghost" size="icon">
            <Share2 size={20} />
          </Button>
        }
      />
      
      <div className="p-4 space-y-6 pb-20">
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
                <span className="text-2xl font-bold text-primary">{(session.price_cents / 100).toFixed(2)}€</span>
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
                session.intensity === 'faible' ? 'default' : 
                session.intensity === 'moyenne' ? 'secondary' : 
                'destructive'
              }>
                {session.intensity}
              </Badge>
              <Badge variant="outline">{session.type}</Badge>
            </div>
            
            {!isEnrolled && !isHost && participants.length < session.max_participants ? (
              <Button variant="sport" size="lg" className="w-full" onClick={handleEnroll} disabled={isLoading}>
                {isLoading ? "Redirection vers le paiement..." : `S'inscrire maintenant - ${(session.price_cents / 100).toFixed(2)}€`}
              </Button>
            ) : isEnrolled ? (
              <Button variant="sportOutline" size="lg" className="w-full" disabled>
                ✓ Vous êtes inscrit(e)
              </Button>
            ) : isHost ? (
              <Button variant="sportOutline" size="lg" className="w-full" disabled>
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
                : `Zone approximative (${session.blur_radius_m || 1000}m) - Inscrivez-vous pour voir le lieu exact`
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

      <Navigation />
    </div>
  );
};

export default SessionDetails;