import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import MapMeetRun from "@/components/MapMeetRun";
import { Filter, MapPin, Users, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const Map = () => {
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRuns();
    if (user) {
      fetchUserRegistrations();
    }
  }, [user]);

  const fetchRuns = async () => {
    const { data, error } = await supabase
      .from('runs')
      .select(`
        *,
        profiles:host_id (full_name),
        registrations (id, user_id, payment_status)
      `)
      .gte('date', new Date().toISOString().split('T')[0]);

    if (!error && data) {
      setRuns(data);
    }
  };

  const fetchUserRegistrations = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_status', 'completed');

    if (!error && data) {
      setRegistrations(data);
    }
  };

  const isRegistered = (runId: string) => {
    return registrations.some(reg => reg.run_id === runId);
  };

  const getParticipantCount = (run: any) => {
    return run.registrations?.filter((r: any) => r.payment_status === 'completed').length || 0;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        title="Carte des courses"
        actions={
          <Button variant="ghost" size="icon">
            <Filter size={20} />
          </Button>
        }
      />
      
      {/* Interactive Map */}
      <div className="flex-1">
        <MapMeetRun 
          runs={runs.map(run => ({
            id: run.id,
            latitude: parseFloat(run.latitude.toString()),
            longitude: parseFloat(run.longitude.toString()),
            title: run.title
          }))}
          onRunSelect={(runId) => {
            const run = runs.find(r => r.id === runId);
            setSelectedRun(run);
          }}
        />
      </div>

      {/* Filter bar */}
      <div className="p-4 bg-white border-t border-border">
        <div className="flex gap-2 overflow-x-auto">
          <Button variant="sport" size="sm">Toutes</Button>
          <Button variant="sportSecondary" size="sm">5km</Button>
          <Button variant="sportSecondary" size="sm">10km</Button>
          <Button variant="sportSecondary" size="sm">Mixte</Button>
          <Button variant="sportSecondary" size="sm">Femmes</Button>
          <Button variant="sportSecondary" size="sm">Faible</Button>
          <Button variant="sportSecondary" size="sm">Moyenne</Button>
          <Button variant="sportSecondary" size="sm">Élevée</Button>
        </div>
      </div>

      {/* Selected run details */}
      {selectedRun && (
        <div className="p-4 bg-white border-t border-border">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-sport-black">{selectedRun.title}</h4>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <MapPin size={14} />
                    {isRegistered(selectedRun.id) 
                      ? selectedRun.location_name 
                      : "Zone approx. 10km (inscrivez-vous pour voir le lieu exact)"
                    }
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedRun(null)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {new Date(selectedRun.date).toLocaleDateString('fr-FR')} {selectedRun.time}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  {getParticipantCount(selectedRun)}/{selectedRun.max_participants} coureurs
                </span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  selectedRun.intensity === 'faible' ? 'bg-green-100 text-green-800' :
                  selectedRun.intensity === 'moyenne' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {selectedRun.intensity}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="sportOutline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => navigate(`/run/${selectedRun.id}`)}
                >
                  Voir détails
                </Button>
                {!isRegistered(selectedRun.id) && getParticipantCount(selectedRun) < selectedRun.max_participants && (
                  <Button variant="sport" size="sm" className="flex-1">
                    Rejoindre - {(selectedRun.price_cents / 100).toFixed(2)}$
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Navigation />
    </div>
  );
};

export default Map;