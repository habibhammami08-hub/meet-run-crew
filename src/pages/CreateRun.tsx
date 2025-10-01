import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, DirectionsRenderer } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import { uiToDbIntensity } from "@/lib/sessions/intensity";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { LocationInput } from "@/components/ui/location-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Zap, Timer, Route, Calendar, ArrowDownCircle, User } from "lucide-react";
import logoImage from "@/assets/meetrun-logo-final.png";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [userReady, setUserReady] = useState<"loading"|"ok"|"none">("loading");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const redirectedRef = useRef(false);
  
  const [center, setCenter] = useState<Pt>({ lat: 48.8566, lng: 2.3522 });
  const [start, setStart] = useState<Pt | null>(null);
  const [end, setEnd] = useState<Pt | null>(null);
  const [waypoints, setWaypoints] = useState<Pt[]>([]);
  const [dirResult, setDirResult] = useState<google.maps.DirectionsResult | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [intensityState, setIntensityState] = useState("course modérée");
  const [sessionTypeState, setSessionTypeState] = useState<"mixed"|"women"|"men">("mixed");
  const [maxParticipantsState, setMaxParticipantsState] = useState<number>(10);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState<"start" | "end" | null>(null);

  // Étape mobile (progressive): "start" | "end" | "done"
  const [mobileStep, setMobileStep] = useState<"start" | "end" | "done">("start");

  // Position actuelle de l'utilisateur
  const [userPosition, setUserPosition] = useState<Pt | null>(null);

  // Refs
  const rootRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);

  const scrollToInfo = () => {
    infoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setCenter(pos);
        setUserPosition(pos);
      });
    }
  }, []);

  // Obtenir la position utilisateur
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserPosition({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Erreur géolocalisation:", error);
          alert("Impossible d'obtenir votre position. Vérifiez les permissions de géolocalisation.");
        }
      );
    } else {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
    }
  };

  // Définir ma position comme départ/arrivée
  const setMyPosition = (locationType: "start" | "end") => {
    if (userPosition) {
      if (locationType === "start") {
        setStart(userPosition);
      } else {
        setEnd(userPosition);
      }
    } else {
      getUserLocation();
      const startTime = Date.now();
      const checkPosition = setInterval(() => {
        if (Date.now() - startTime > 10000) {
          clearInterval(checkPosition);
          return;
        }
        if (userPosition) {
          if (locationType === "start") {
            setStart(userPosition);
          } else {
            setEnd(userPosition);
          }
          clearInterval(checkPosition);
        }
      }, 100);
    }
  };

  // Vérification d'authentification (redirection immédiate si non connecté)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { 
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          navigate(`/auth?returnTo=${encodeURIComponent('/create')}`, { replace: true });
        }
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        setCurrentUser(user);
        if (user) {
          setUserReady("ok");
        } else {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            // Pas d'écran intermédiaire : on redirige directement vers l'auth
            navigate(`/auth?returnTo=${encodeURIComponent('/create')}`, { replace: true });
          }
          setUserReady("none");
        }
      } catch (error) {
        console.error("[CreateRun] Auth error:", error);
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          navigate(`/auth?returnTo=${encodeURIComponent('/create')}`, { replace: true });
        }
        if (alive) setUserReady("none");
      }
    })();
    return () => { alive = false; };
  }, [supabase, navigate]);

  const mapContainerStyle = useMemo(() => ({ width: "100%", height: "70vh" }), []);

  function disabledReason() {
    if (isSaving) return "Sauvegarde en cours…";
    if (!start) return "Définissez un point de départ (clic sur la carte)";
    if (!end) return "Définissez un point d'arrivée (clic sur la carte)";
    if (!dirResult) return "Calculez l'itinéraire";
    if (!title?.trim()) return "Indiquez un titre";
    if (!dateTime) return "Choisissez date & heure";
    return "";
  }

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    const lat = e.latLng?.lat(), lng = e.latLng?.lng();
    if (lat == null || lng == null) return;
    
    if (isSelectingLocation === "start") {
      setStart({ lat, lng });
      setIsSelectingLocation(null);
    } else if (isSelectingLocation === "end") {
      setEnd({ lat, lng });
      setIsSelectingLocation(null);
    } else if (!start) {
      setStart({ lat, lng });
    } else if (!end) {
      setEnd({ lat, lng });
    } else {
      setWaypoints(prev => [...prev, { lat, lng }]);
    }
  };

  async function calcRoute(origin?: Pt | null, dest?: Pt | null, wps?: Pt[]) {
    const o = origin ?? start, d = dest ?? end;
    if (!o || !d) return;
    
    try {
      const svc = new google.maps.DirectionsService();
      const res = await svc.route({
        origin: o,
        destination: d,
        waypoints: (wps ?? waypoints).map(w => ({ location: w })),
        travelMode: google.maps.TravelMode.WALKING,
        provideRouteAlternatives: false,
        optimizeWaypoints: false,
      });
      setDirResult(res);
      const meters = res.routes[0].legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0;
      setDistanceKm(meters / 1000);
    } catch (error) {
      console.error("[CreateRun] Directions error:", error);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { if (start && end) calcRoute(); }, 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(start), JSON.stringify(end), JSON.stringify(waypoints)]);

  function toIsoFromLocal(input: string): string | null {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // Sync de l'étape mobile
  useEffect(() => {
    if (!start) setMobileStep("start");
    else if (!end) setMobileStep("end");
    else setMobileStep("done");
  }, [start, end]);

  // Masquage agressif du bouton "Sélectionner sur la carte"
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const hide = () => {
      const selectors = [
        '[aria-label*="électionner"]',
        '[title*="électionner"]',
        '[aria-label*="Select"]',
        '[title*="Select"]',
        'button[aria-label*="map"]',
        'button[title*="map"]',
        '.map-select',
        '.btn-map-select'
      ];
      
      selectors.forEach(selector => {
        const elements = root.querySelectorAll<HTMLElement>(selector);
        elements.forEach(el => {
          const t1 = el.textContent?.toLowerCase() || "";
          const t2 = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
          if (t1.includes('électionner') || t1.includes('select') || t2.includes('électionner') || t2.includes('select')) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
          }
        });
      });

      const allButtons = root.querySelectorAll<HTMLElement>('button, [role="button"]');
      allButtons.forEach((el) => {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        if (text.includes('électionner') || text.includes('select')) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
        }
      });
    };

    hide();
    const obs = new MutationObserver(() => hide());
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [mobileStep]);

  const ensureProfileExists = async () => {
    if (!currentUser) return false;
    
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!prof) {
        const { error: upErr } = await supabase.from('profiles').upsert({ 
          id: currentUser.id, 
          email: currentUser.email || '',
          full_name: currentUser.email?.split('@')[0] || 'Runner',
          sessions_hosted: 0,
          sessions_joined: 0,
          total_km: 0
        });
        
        if (upErr) {
          alert("Impossible de créer votre profil. Reconnectez-vous puis réessayez.");
          return false;
        }
      }
      return true;
    } catch (profileError) {
      alert("Erreur lors de la vérification du profil.");
      return false;
    }
  };

  const validateSessionData = () => {
    if (!start || !end) { 
      alert("Définissez un départ et une arrivée (clics sur la carte)."); 
      return false; 
    }
    if (!dirResult) { 
      alert("Impossible de calculer l'itinéraire."); 
      return false; 
    }
    if (!title?.trim()) { 
      alert("Indiquez un titre."); 
      return false; 
    }
    const scheduledIso = toIsoFromLocal(dateTime);
    if (!scheduledIso) { 
      alert("Date/heure invalide."); 
      return false; 
    }

    const now = new Date();
    const scheduled = new Date(scheduledIso);
    if (scheduled <= now) { 
      alert("La date doit être dans le futur."); 
      return false; 
    }
    if (scheduled.getTime() - now.getTime() < 45 * 60 * 1000) {
      alert("La date et l'heure doivent être au minimum dans 45 minutes.");
      return false;
    }

    if (Number.isNaN(Number(maxParticipantsState)) || maxParticipantsState < 2 || maxParticipantsState > 11) {
      alert("Le nombre maximum de participants doit être compris entre 2 et 11.");
      return false;
    }
    
    return { scheduledIso };
  };

  const createSessionPayload = (scheduledIso: string) => {
    const r = (dirResult || {} as any).routes?.[0];
    const legs = r?.legs ?? [];
    const meters = legs.reduce((s: number, l: any) => s + (l?.distance?.value ?? 0), 0);
    const poly = r?.overview_polyline?.toString?.() ?? r?.overview_polyline?.points ?? "";
    const startAddr = legs[0]?.start_address ?? null;
    const endAddr = legs[legs.length - 1]?.end_address ?? null;

    const sessionTypeMapping: { [key: string]: string } = {
      "mixed": "mixed",
      "women": "women_only",
      "men": "men_only"
    };

    const boundedMax = Math.min(11, Math.max(2, Number(maxParticipantsState) || 10));

    const payload: any = {
      host_id: currentUser?.id,
      title: title.trim(),
      scheduled_at: scheduledIso,
      start_lat: Number(start!.lat), 
      start_lng: Number(start!.lng),
      end_lat: Number(end!.lat), 
      end_lng: Number(end!.lng),
      distance_km: Math.round((meters / 1000) * 100) / 100,
      route_distance_m: meters,
      route_polyline: poly || null,
      start_place: startAddr, 
      end_place: endAddr,
      location_hint: startAddr ? startAddr.split(',')[0] : `Zone ${start!.lat.toFixed(3)}, ${start!.lng.toFixed(3)}`,
      intensity: uiToDbIntensity(intensityState),
      session_type: sessionTypeMapping[sessionTypeState] || "mixed",
      max_participants: Math.min(11, Math.max(2, boundedMax)),
      status: "published",
      blur_radius_m: 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (description?.trim()) {
      payload.description = description.trim();
    }

    return payload;
  };

  const handlePostCreation = async (sessionData: any) => {
    try {
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('sessions_hosted')
        .eq('id', currentUser.id)
        .single();
      
      if (currentProfile) {
        await supabase
          .from('profiles')
          .update({ 
            sessions_hosted: (currentProfile.sessions_hosted || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser.id);
      }
      
      window.dispatchEvent(new CustomEvent('profileRefresh', { 
        detail: { 
          userId: currentUser.id,
          action: 'session_created',
          sessionId: sessionData.id 
        } 
      }));
      
      window.dispatchEvent(new CustomEvent('mapRefresh', { 
        detail: { 
          newSession: sessionData,
          userId: currentUser.id 
        } 
      }));
    } catch (_) {}
  };

  const resetForm = () => {
    setStart(null); 
    setEnd(null); 
    setWaypoints([]); 
    setDirResult(null); 
    setDistanceKm(null);
    setTitle(""); 
    setDescription(""); 
    setDateTime(""); 
    setIntensityState("course modérée"); 
    setSessionTypeState("mixed"); 
    setMaxParticipantsState(10);
  };

  async function onSubmit() {
    if (!supabase) { 
      alert("Configuration Supabase manquante."); 
      return; 
    }
    
    setIsSaving(true);
    try {
      if (!currentUser) {
        alert("Veuillez vous connecter pour créer une session.");
        return;
      }

      const profileExists = await ensureProfileExists();
      if (!profileExists) return;

      const validation = validateSessionData();
      if (!validation) return;
      const { scheduledIso } = validation;

      if (!dirResult) {
        await calcRoute();
        if (!dirResult) {
          alert("Impossible de calculer l'itinéraire.");
          return;
        }
      }

      const payload = createSessionPayload(scheduledIso);
      const { data, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select("id,title,scheduled_at")
        .single();
      
      if (error) { 
        alert("Création impossible : " + (error.message || error.details || "erreur inconnue")); 
        return; 
      }

      await handlePostCreation(data);
      
      alert(`🎉 Session créée avec succès !

"${data.title}"
ID: ${data.id}

Vous allez être redirigé vers la carte pour voir votre session.`);
      resetForm();
      
      setTimeout(() => {
        navigate("/map", { 
          state: { newSessionId: data.id, shouldFocus: true } 
        });
      }, 1500);
      
    } catch (e: any) {
      alert("Erreur lors de la création : " + (e.message || "Erreur inconnue"));
    } finally {
      setIsSaving(false);
    }
  }

  if (userReady === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Vérification de votre session…</p>
        </div>
      </div>
    );
  }
  
  // Plus d'écran "Connexion requise" : si non connecté, on a déjà redirigé vers /auth

  // Composant avec bouton "Ma position"
  const LocationInputWithMyPosition = ({ 
    value, 
    onChange, 
    placeholder, 
    icon, 
    locationType
  }: {
    value: Pt | null;
    onChange: (val: Pt | null) => void;
    placeholder: string;
    icon: "start" | "end";
    locationType: "start" | "end";
  }) => {
    return (
      <div className="space-y-2">
        <LocationInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          icon={icon}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMyPosition(locationType)}
          className="px-3 h-8 text-xs"
          title="Utiliser ma position actuelle"
        >
          📍 Ma position
        </Button>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3" style={{ background: 'linear-gradient(to right, #101111, #2c2d2c)' }}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <img
            src={logoImage}
            alt="MeetRun Logo"
            className="h-10 w-auto"
          />
          <div className="flex items-center gap-2">
            {currentUser ? (
              <Button variant="ghost" onClick={() => navigate("/profile")} className="flex items-center gap-2 text-white hover:text-white hover:bg-white/10">
                <User size={16} />
                Profil
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate("/auth?returnTo=/create")} className="text-white font-semibold hover:bg-white/10">
                  Se connecter
                </Button>
                <Button variant="sport" onClick={() => navigate("/auth?mode=signup&returnTo=/create")}>
                  S'inscrire
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <style>{`
  .li-no-mapselect [aria-label*="électionner"],
  .li-no-mapselect [title*="électionner"],
  .li-no-mapselect [aria-label*="Select"],
  .li-no-mapselect [title*="Select"],
  .li-no-mapselect button[aria-label*="map"],
  .li-no-mapselect button[title*="map"],
  .li-no-mapselect .map-select,
  .li-no-mapselect .btn-map-select,
  .li-no-mapselect button:has-text("Sélectionner"),
  .li-no-mapselect button:has-text("Select") {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }
  .li-no-mapselect .actions > button:nth-child(2),
  .li-no-mapselect .button-group > button:nth-child(2),
  .li-no-mapselect div > button + button {
    display: none !important;
  }
  .li-no-mapselect input::placeholder {
    font-size: 0.75rem;
    line-height: 1rem;
  }
      `}</style>

      <div className="container mx-auto px-4 py-6 max-w-4xl pt-24">
        <div className="text-center mb-8">
          {/* ↓↓↓ TITRES plus petits sur mobile, identiques sur desktop/tablette */}
          <h1 className="font-bold gradient-primary bg-clip-text text-transparent mb-3 text-2xl lg:text-3xl">
            Créer une nouvelle session
          </h1>
          <p className="text-muted-foreground text-base lg:text-lg">
            Planifiez votre prochaine session et rencontrez de nouvelles personnes.
          </p>
        </div>

        {/* MOBILE */}
        <div className="lg:hidden space-y-4">
          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="relative">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "70vh" }}  // ↑ carte plus haute sur mobile
                  zoom={13}
                  center={start ?? center}
                  options={{ 
                    mapTypeControl: false, 
                    streetViewControl: false, 
                    fullscreenControl: false,
                    gestureHandling: 'greedy'
                  }}
                  onClick={handleMapClick}
                >
                  {start && (
                    <MarkerF 
                      position={start}
                      onClick={() => setStart(null)}
                      icon={{
                        url: "data:image/svg+xml;base64," + btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#16a34a" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40)
                      }}
                    />
                  )}
                  {end && (
                    <MarkerF 
                      position={end}
                      onClick={() => setEnd(null)}
                      icon={{
                        url: "data:image/svg+xml;base64," + btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#dc2626" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40)
                      }}
                    />
                  )}
                  {start && end && dirResult && (
                    <DirectionsRenderer
                      directions={dirResult}
                      options={{ 
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: "#3b82f6",
                          strokeWeight: 4,
                          strokeOpacity: 0.8
                        }
                      }}
                    />
                  )}
                </GoogleMap>

                {/* Panneau flottant haut */}
                <div className="absolute inset-x-2 top-2 bg-background/50 backdrop-blur-sm rounded-lg shadow-lg p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Route className="h-5 w-5 text-primary" />
                    <h3 className="text-sm font-semibold">Définir le parcours</h3>
                  </div>

                  {mobileStep === "start" && (
                    <div className="space-y-1 li-no-mapselect text-xs">
                      <LocationInputWithMyPosition
                        value={start}
                        onChange={(val) => setStart(val)}
                        placeholder="Adresse de départ (ou touchez la carte)"
                        icon="start"
                        locationType="start"
                      />
                    </div>
                  )}

                  {mobileStep === "end" && (
                    <div className="space-y-1 li-no-mapselect text-xs">
                      <LocationInputWithMyPosition
                        value={end}
                        onChange={(val) => setEnd(val)}
                        placeholder="Adresse d'arrivée (ou touchez la carte)"
                        icon="end"
                        locationType="end"
                      />
                    </div>
                  )}

                  {mobileStep === "done" && (
                    <div className="flex items-start gap-2 p-2 bg-muted/60 rounded-lg">
                      <span aria-hidden className="text-2xl leading-none">💡</span>
                      <p className="text-xs text-slate-700">
                        Si l'itinéraire ne vous convient pas, vous pouvez ajouter des étapes intermédiaires afin de personnaliser votre parcours.
                      </p>
                    </div>
                  )}

                  {distanceKm && (
                    <div className="mt-2 flex items-center gap-2 p-2 bg-muted/60 rounded-lg">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="text-xs">
                        Distance calculée : <strong>{distanceKm.toFixed(2)} km</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Boutons flottants bas : Valider + Supprimer sous Valider */}
                {mobileStep === "done" && (
                  <div className="absolute inset-x-8 bottom-24 lg:hidden flex flex-col items-center gap-3 pointer-events-none">
                    <Button
                      type="button"
                      onClick={scrollToInfo}
                      aria-label="Valider le parcours et passer aux informations générales"
                      className={[
                        "pointer-events-auto",
                        // style moderne
                        "rounded-full h-12 px-6 text-sm font-semibold",
                        "bg-gradient-to-r from-blue-600 to-indigo-600",
                        "text-white shadow-lg shadow-black/20",
                        "backdrop-blur-sm",
                        "ring-1 ring-white/40",
                        "transition-transform duration-200 active:scale-95",
                        "hover:from-blue-600 hover:to-indigo-700",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"].join(" ")}
                    >
                      <div className="flex items-center gap-2 justify-center">
                        <ArrowDownCircle className="h-5 w-5" />
                        <span>Validé</span>
                      </div>
                    </Button>

                    {waypoints.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setWaypoints([]);
                          if (start && end) calcRoute(start, end, []);
                        }}
                        className="pointer-events-auto"
                      >
                        Supprimer les points intermédiaires ({waypoints.length})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* DESKTOP & TABLET */}
        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <div className="space-y-6">
            <Card className="shadow-card hidden lg:block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  Définir le parcours
                </CardTitle>
                <CardDescription>
                  Sélectionnez vos points de départ et d'arrivée
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Point de départ *
                  </label>
                  <div className="li-no-mapselect text-xs">
                    <LocationInputWithMyPosition
                      value={start}
                      onChange={setStart}
                      placeholder="Saisissez l'adresse de départ ou appuyez directement sur la carte."
                      icon="start"
                      locationType="start"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Point d'arrivée *
                  </label>
                  <div className="li-no-mapselect text-xs">
                    <LocationInputWithMyPosition
                      value={end}
                      onChange={setEnd}
                      placeholder="Saisissez l'adresse d'arrivée ou appuyez directement sur la carte."
                      icon="end"
                      locationType="end"
                    />
                  </div>
                </div>

                {distanceKm && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      Distance calculée: <strong>{distanceKm.toFixed(2)} km</strong>
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg">
                  <span aria-hidden className="text-2xl leading-none">💡</span>
                  <p className="text-xs text-slate-600">
                    Si l'itinéraire ne vous convient pas, vous pouvez ajouter des étapes intermédiaires afin de personnaliser votre parcours.
                  </p>
                </div>
              </CardContent>
            </Card>

            {waypoints.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setWaypoints([]);
                  if (start && end) calcRoute(start, end, []);
                }}
                className="w-full hidden lg:inline-flex"
              >
                Supprimer les points intermédiaires ({waypoints.length})
              </Button>
            )}

            {/* Ancre de scroll + Carte Informations générales */}
            <div ref={infoRef}>
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Informations générales
                  </CardTitle>
                  <CardDescription>
                    Définissez les détails de votre session
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Titre de la session *
                    </label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="ex: Course matinale au parc"
                      className="h-12 text-base"
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Description (optionnel)
                    </label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Décrivez votre session: niveau requis, équipements, conseils..."
                      className="min-h-[100px] text-base"
                      maxLength={500}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Date et heure *
                    </label>
                    <DateTimePicker
                      value={dateTime}
                      onChange={setDateTime}
                      placeholder="Choisir la date et l'heure"
                    />
                    <p className="text-xs text-muted-foreground">
                      ⚠️ La date et l’heure doivent être fixées au moins 45 minutes à l’avance.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Paramètres de la session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Intensité
                    </label>
                    <Select value={intensityState} onValueChange={setIntensityState}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marche">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-green-100 text-green-800">Facile</Badge>
                            Marche
                          </div>
                        </SelectItem>
                        <SelectItem value="course modérée">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Modéré</Badge>
                            Course modérée
                          </div>
                        </SelectItem>
                        <SelectItem value="course intensive">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-red-100 text-red-800">Intense</Badge>
                            Course intensive
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Type de session
                    </label>
                    <Select value={sessionTypeState} onValueChange={(value: any) => setSessionTypeState(value)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Mixte</SelectItem>
                        <SelectItem value="women">Femmes uniquement</SelectItem>
                        <SelectItem value="men">Hommes uniquement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Nombre maximum de participants (2–11)
                  </label>
                  <Input
                    type="number"
                    min={2}
                    max={11}
                    value={maxParticipantsState}
                    onChange={(e) => {
                      const v = Number(e.target.value || 10);
                      const clamped = Math.min(11, Math.max(2, v));
                      setMaxParticipantsState(clamped);
                    }}
                    className="h-12"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!!disabledReason()}
                className="w-full h-12 text-base font-medium gradient-primary"
                size="lg"
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Création en cours...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Créer la session
                  </div>
                )}
              </Button>

              {!!disabledReason() && (
                <div className="text-sm text-muted-foreground text-center bg-muted/50 p-3 rounded-lg">
                  <strong>Pour continuer :</strong> {disabledReason()}
                </div>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-6">
            <Card className="shadow-card overflow-hidden hidden lg:block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Carte interactive
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "500px" }}
                  zoom={13}
                  center={start ?? center}
                  options={{ 
                    mapTypeControl: false, 
                    streetViewControl: false, 
                    fullscreenControl: false,
                    gestureHandling: 'greedy'
                  }}
                  onClick={handleMapClick}
                >
                  {start && (
                    <MarkerF 
                      position={start}
                      onClick={() => setStart(null)}
                      icon={{
                        url: "data:image/svg+xml;base64," + btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#16a34a" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40)
                      }}
                    />
                  )}
                  {end && (
                    <MarkerF 
                      position={end}
                      onClick={() => setEnd(null)}
                      icon={{
                        url: "data:image/svg+xml;base64," + btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#dc2626" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40)
                      }}
                    />
                  )}
                  {start && end && dirResult && (
                    <DirectionsRenderer
                      directions={dirResult}
                      options={{ 
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: "#3b82f6",
                          strokeWeight: 4,
                          strokeOpacity: 0.8
                        }
                      }}
                    />
                  )}
                </GoogleMap>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
