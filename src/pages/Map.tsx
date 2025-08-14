import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import LeafletMeetRunMap from "@/components/LeafletMeetRunMap";
import { Filter, MapPin, Users, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

const Map = () => {
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  const chRef = useRef<any>(null);
  
  useEffect(() => {
    fetchSessions();
    if (user) {
      fetchUserEnrollments();
    }
  }, [user]);

  useEffect(() => {
    if (chRef.current) return;
    chRef.current = supabase
      .channel("public:sessions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, (p) =>
        setSessions(prev => [p.new as any, ...prev])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, (p) =>
        setSessions(prev => prev.map(s => s.id === p.new.id ? (p.new as any) : s))
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sessions" }, (p) =>
        setSessions(prev => prev.filter(s => s.id !== p.old.id))
      )
      .subscribe((status) => console.log("🛰️ Realtime sessions:", status));
    return () => { chRef.current?.unsubscribe(); chRef.current = null; };
  }, []);

  const fetchSessions = async () => {
    let { data, error } = await supabase
      .from("sessions")
      .select(`
        id, title, date, distance_km, intensity, type, max_participants,
        location_lat, location_lng, end_lat, end_lng, blur_radius_m,
        host_id, area_hint, price_cents,
        profiles!host_id ( id, full_name, avatar_url )
      `)
      .gte('date', new Date().toISOString());

    if (error) {
      console.warn("[sessions] fallback join error:", error);
      const fb = await supabase
        .from("sessions")
        .select("*")
        .gte('date', new Date().toISOString());
      data = fb.data ?? [];
    }
    setSessions(data ?? []);
  };

  const fetchUserEnrollments = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'paid');

    if (!error && data) {
      setEnrollments(data);
    }
  };

  const isEnrolled = (sessionId: string) => {
    return enrollments.some(enr => enr.session_id === sessionId);
  };

  const getParticipantCount = (session: any) => {
    return session.enrollments?.filter((e: any) => e.status === 'paid').length || 0;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        title="Carte des sessions"
        actions={
          <Button variant="ghost" size="icon">
            <Filter size={20} />
          </Button>
        }
      />
      
      {/* Interactive Map */}
      <div className="flex-1">
        <LeafletMeetRunMap 
          sessions={sessions.map(session => ({
            id: session.id,
            title: session.title,
            date: session.date,
            location_lat: parseFloat(session.location_lat.toString()),
            location_lng: parseFloat(session.location_lng.toString()),
            blur_radius_m: session.blur_radius_m || 1000,
            area_hint: session.area_hint,
            max_participants: session.max_participants,
            price_cents: session.price_cents,
            distance_km: parseFloat(session.distance_km.toString()),
            intensity: session.intensity,
            host_id: session.host_id,
            enrollments: session.enrollments,
            host_profile: session.host_profile
          }))}
          onSessionSelect={(sessionId) => {
            const session = sessions.find(s => s.id === sessionId);
            setSelectedSession(session);
          }}
          className="h-full"
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

      {/* Selected session details */}
      {selectedSession && (
        <div className="p-4 bg-white border-t border-border">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-sport-black">{selectedSession.title}</h4>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <MapPin size={14} />
                    {isEnrolled(selectedSession.id) 
                      ? selectedSession.area_hint || "Lieu exact visible après inscription"
                      : `Zone approx. ${Math.round((selectedSession.blur_radius_m || 1000)/1000)}km`
                    }
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedSession(null)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {new Date(selectedSession.date).toLocaleDateString('fr-FR')}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  {getParticipantCount(selectedSession)}/{selectedSession.max_participants} coureurs
                </span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  selectedSession.intensity === 'low' ? 'bg-green-100 text-green-800' :
                  selectedSession.intensity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {selectedSession.intensity}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="sportOutline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => navigate(`/session/${selectedSession.id}`)}
                >
                  Voir détails
                </Button>
                {!isEnrolled(selectedSession.id) && getParticipantCount(selectedSession) < selectedSession.max_participants && (
                  <Button variant="sport" size="sm" className="flex-1">
                    Rejoindre - {(selectedSession.price_cents / 100).toFixed(2)}$
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      
    </div>
  );
};

export default Map;