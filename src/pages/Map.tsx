import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import LeafletMeetRunMap from "@/components/LeafletMeetRunMap";
import { Filter, MapPin, Users, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const Map = () => {
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
    if (user) {
      fetchUserEnrollments();
    }
    
    // Set up real-time subscription for sessions - une seule fois
    const channel = supabase
      .channel('public:sessions')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'sessions' },
        async (payload) => {
          console.log('New session created via Realtime:', payload.new);
          // Fetch the complete session with host info
          const { data: newSessionWithHost } = await supabase
            .from('sessions')
            .select(`
              *,
              host_profile:profiles!host_id(id, full_name, age, avatar_url),
              enrollments(id, user_id, status)
            `)
            .eq('id', payload.new.id)
            .single();
          
          if (newSessionWithHost) {
            setSessions(prev => [newSessionWithHost, ...prev]);
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        async (payload) => {
          console.log('Session updated via Realtime:', payload.new);
          // Update session in list with latest data
          const { data: updatedSession } = await supabase
            .from('sessions')
             .select(`
               *,
               host_profile:profiles!host_id(id, full_name, age, avatar_url),
               enrollments(id, user_id, status)
             `)
            .eq('id', payload.new.id)
            .single();
          
          if (updatedSession) {
            setSessions(prev => prev.map(session => 
              session.id === payload.new.id ? updatedSession : session
            ));
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sessions' },
        (payload) => {
          console.log('Session deleted via Realtime:', payload.old);
          setSessions(prev => prev.filter(session => session.id !== payload.old.id));
          if (selectedSession?.id === payload.old.id) {
            setSelectedSession(null);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user]); // Dependency sur user seulement

  const fetchSessions = async () => {
    console.log("🔍 Fetching sessions started...");
    console.log("📅 Current datetime filter:", new Date().toISOString());
    
    try {
      // First query: Simple test to check if we can read sessions at all
      console.log("🧪 Testing basic select query...");
      const { data: testData, error: testError } = await supabase
        .from('sessions')
        .select('id, title, date')
        .limit(5);
      
      console.log("🧪 Basic query result:", { data: testData, error: testError });
      
      if (testError) {
        console.error('❌ Basic query failed:', testError);
        throw new Error(`Basic query failed: ${testError.message}`);
      }

      // Second query: Full query with joins and filters
      console.log("🔍 Executing full sessions query...");
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          host_profile:profiles!host_id (id, full_name, age, avatar_url),
          enrollments (id, user_id, status)
        `)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true });

      console.log("📊 Full query result:", { 
        data: data, 
        error: error, 
        count: data?.length,
        raw_data_sample: data?.slice(0, 2)
      });

      if (error) {
        console.error('❌ Full query error:', error);
        throw new Error(`Query failed: ${error.message}`);
      }

      if (data && data.length > 0) {
        console.log('✅ Sessions fetched successfully:', data.length, "sessions");
        console.log('📋 Session details:', data.map(s => ({ 
          id: s.id, 
          title: s.title, 
          date: s.date,
          lat: s.location_lat,
          lng: s.location_lng
        })));
        
        // Verify coordinate validity
        const invalidSessions = data.filter(s => 
          !Number.isFinite(s.location_lat) || 
          !Number.isFinite(s.location_lng)
        );
        
        if (invalidSessions.length > 0) {
          console.warn('⚠️ Sessions with invalid coordinates:', invalidSessions);
        }
        
        setSessions(data);
        console.log('✅ Sessions state updated successfully');
      } else {
        console.log('⚠️ No sessions found or empty result');
        setSessions([]);
      }
    } catch (error) {
      console.error('💥 Failed to fetch sessions:', error);
      setSessions([]);
    }
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
        {(() => {
          console.log('🗺️ Rendering map with sessions:', sessions.length);
          const mappedSessions = sessions.map(session => {
            const mapped = {
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
            };
            console.log('🗺️ Mapped session:', mapped);
            return mapped;
          });
          
          return (
            <LeafletMeetRunMap 
              sessions={mappedSessions}
              onSessionSelect={(sessionId) => {
                console.log('🎯 Session selected:', sessionId);
                const session = sessions.find(s => s.id === sessionId);
                setSelectedSession(session);
              }}
              className="h-full"
            />
          );
        })()}
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