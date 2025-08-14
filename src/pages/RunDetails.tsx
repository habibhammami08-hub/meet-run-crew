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

const RunDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [run, setRun] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (id) {
      fetchRunDetails();
    }
  }, [id, user]);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      toast({
        title: "Paiement réussi !",
        description: "Vous êtes maintenant inscrit à cette course.",
      });
    } else if (paymentStatus === 'canceled') {
      toast({
        title: "Paiement annulé",
        description: "Votre inscription n'a pas été finalisée.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  const fetchRunDetails = async () => {
    const { data: runData } = await supabase
      .from('runs')
      .select(`
        *,
        profiles:host_id (full_name, age, gender, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (runData) {
      setRun(runData);
    }

    // Fetch participants
    const { data: participantsData } = await supabase
      .from('registrations')
      .select(`
        *,
        profiles:user_id (full_name, age, gender)
      `)
      .eq('run_id', id)
      .eq('payment_status', 'completed');

    if (participantsData) {
      setParticipants(participantsData);
      
      // Check if current user is registered
      if (user) {
        const userRegistration = participantsData.find(p => p.user_id === user.id);
        setIsRegistered(!!userRegistration);
      }
    }
  };

  const handleRegister = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Vous devez être connecté pour vous inscrire.",
        variant: "destructive",
      });
      return;
    }

    if (!run) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { runId: run.id }
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

  if (!run) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="Détails de la course" 
        actions={
          <Button variant="ghost" size="icon">
            <Share2 size={20} />
          </Button>
        }
      />
      
      <div className="p-4 space-y-6 pb-20">
        {/* Main run info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-xl font-bold text-sport-black mb-2">{run.title}</h1>
                <p className="text-sport-gray flex items-center gap-1">
                  <MapPin size={16} />
                  {isRegistered 
                    ? run.location_name 
                    : "Zone approx. 10km (inscrivez-vous pour voir le lieu exact)"
                  }
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-primary">{(run.price_cents / 100).toFixed(2)}$</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
              <span className="flex items-center gap-1">
                <Calendar size={16} />
                {new Date(run.date).toLocaleDateString('fr-FR')}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={16} />
                {run.time}
              </span>
              <span className="flex items-center gap-1">
                <Users size={16} />
                {participants.length}/{run.max_participants} participants
              </span>
            </div>

            <div className="flex gap-2 mb-6">
              <Badge variant="secondary">{run.distance}</Badge>
              <Badge variant={
                run.intensity === 'faible' ? 'default' : 
                run.intensity === 'moyenne' ? 'secondary' : 
                'destructive'
              }>
                {run.intensity}
              </Badge>
              <Badge variant="outline">{run.type}</Badge>
            </div>

            <p className="text-sport-gray mb-6">
              {run.description || "Rejoignez-nous pour une session de running conviviale !"}
            </p>
            
            {!isRegistered && participants.length < run.max_participants ? (
              <Button variant="sport" size="lg" className="w-full" onClick={handleRegister} disabled={isLoading}>
                {isLoading ? "Redirection vers le paiement..." : `S'inscrire maintenant - ${(run.price_cents / 100).toFixed(2)}$`}
              </Button>
            ) : isRegistered ? (
              <Button variant="sportOutline" size="lg" className="w-full" disabled>
                ✓ Vous êtes inscrit(e)
              </Button>
            ) : (
              <Button variant="ghost" size="lg" className="w-full" disabled>
                Course complète
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
              {isRegistered 
                ? run.location_name 
                : "Zone approx. 10km (inscrivez-vous pour voir le lieu exact)"
              }
            </p>
          </CardContent>
        </Card>

        {/* Participants */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Participants ({participants.length}/{run.max_participants})</h3>
            <div className="space-y-3">
              {/* Host */}
              <div className="flex items-center justify-between p-3 bg-sport-light rounded-lg">
                <div className="flex items-center gap-3">
                  {run.profiles?.avatar_url ? (
                    <img 
                      src={run.profiles.avatar_url} 
                      alt="Host avatar"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
                      {run.profiles?.full_name?.charAt(0) || 'H'}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{run.profiles?.full_name || 'Organisateur'}</p>
                    <p className="text-sm text-sport-gray">
                      {isRegistered 
                        ? `${run.profiles?.age || '?'} ans, ${run.profiles?.gender || '?'}` 
                        : `${run.profiles?.age || '?'} ans, ${run.profiles?.gender || '?'}`
                      }
                    </p>
                  </div>
                </div>
                <Badge variant="default">Hôte</Badge>
              </div>
              
              {/* Participants */}
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sport-secondary rounded-full flex items-center justify-center text-white font-semibold">
                      {participant.profiles?.full_name?.charAt(0) || 'P'}
                    </div>
                    <div>
                      <p className="font-medium">
                        {isRegistered 
                          ? participant.profiles?.full_name || 'Participant' 
                          : 'Participant'
                        }
                      </p>
                      <p className="text-sm text-sport-gray">
                        {participant.profiles?.age || '?'} ans, {participant.profiles?.gender || '?'}
                      </p>
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

export default RunDetails;