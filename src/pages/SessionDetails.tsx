// src/pages/SessionDetails.tsx — Desktop: prévention sous la carte, pas en overlay; Mobile optimisé
// - Google Maps avec parcours BLEU + départ masqué pour non-abonnés/paiement
// - Trim du début de la polyline
// - Bouton "Retour aux sessions"
// - Callout en "hanging indent" avec texte mis à jour
// - Prévention: overlay uniquement sur mobile? → Non : bloc normal sous la carte sur mobile ET desktop
// - Mobile: la carte passe en premier, puis bloc prévention (sous la carte), puis le bloc "Rejoindre cette session"

import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Calendar,
  Clock,
  Users,
  Trash2,
  Crown,
  CreditCard,
  CheckCircle,
  User,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import polyline from "@mapbox/polyline";

// ------------------------------------
// Utils
// ------------------------------------
type LatLng = { lat: number; lng: number };

function seededNoise(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 10000) / 10000;
  const v = (((h * 48271) >>> 0) % 10000) / 10000;
  return { u, v };
}

function jitterDeterministic(lat: number, lng: number, meters: number, seed: string): LatLng {
  const { u, v } = seededNoise(seed);
  const w = meters * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const dLat = w / 111320; // deg/m
  const dLng = w / (111320 * Math.cos((lat * Math.PI) / 180)); // deg/m
  return { lat: lat + dLat * Math.cos(t), lng: lng + dLng * Math.sin(t) };
}

const pathFromPolyline = (p?: string | null): LatLng[] => {
  if (!p) return [];
  try {
    return polyline.decode(p).map(([lat, lng]) => ({ lat, lng }));
  } catch {
    return [];
  }
};

// Couper les X premiers mètres du tracé pour éviter de déduire le départ
function trimRouteStart(path: LatLng[], meters: number): LatLng[] {
  if (!path || path.length < 2 || meters <= 0) return path || [];
  const R = 6371000; // m
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const hav = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav)) * R; // meters
    acc += d;
    if (acc >= meters) return path.slice(i);
  }
  // Si le parcours est plus court que la distance à couper, on garde seulement le dernier point
  return path.slice(-1);
}

// ------------------------------------
// Page
// ------------------------------------
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

  // Map state
  const [center, setCenter] = useState<LatLng | null>(null);

  useEffect(() => {
    if (id) fetchSessionDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast({ title: "Paiement réussi !", description: "Vous êtes maintenant inscrit à cette session." });
    } else if (paymentStatus === "canceled") {
      toast({ title: "Paiement annulé", description: "Votre inscription n'a pas été finalisée.", variant: "destructive" });
    }
  }, [searchParams, toast]);

  const fetchSessionDetails = async () => {
    const { data: sessionData, error } = await supabase
      .from("sessions")
      .select(`*, profiles:host_id (id, full_name, age, gender, avatar_url, city)`)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching session:", error);
      toast({ title: "Erreur", description: "Impossible de charger les détails de la session.", variant: "destructive" });
      return;
    }

    if (sessionData) {
      setSession(sessionData);
    }

    const { data: participantsData } = await supabase
      .from("enrollments")
      .select(`*, profiles:user_id (id, full_name, age, gender, avatar_url, city)`)
      .eq("session_id", id)
      .in("status", ["paid", "included_by_subscription", "confirmed"]);

    if (participantsData) {
      setParticipants(participantsData);
      if (user) setIsEnrolled(!!participantsData.find((p) => p.user_id === user.id));
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
          .from("enrollments")
          .insert({ session_id: session.id, user_id: user.id, status: "included_by_subscription" });
        if (error) throw error;
        toast({ title: "Inscription réussie !", description: "Vous êtes maintenant inscrit à cette session." });
        fetchSessionDetails();
      } catch (error: any) {
        console.error("Error enrolling:", error);
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteSession = async () => {
    if (!session || !user || session.host_id !== user.id) return;
    setIsDeleting(true);
    try {
      const { error: enrollmentsError } = await supabase.from("enrollments").delete().eq("session_id", session.id);
      if (enrollmentsError) throw enrollmentsError;
      const { error: sessionError } = await supabase.from("sessions").delete().eq("id", session.id).eq("host_id", user.id);
      if (sessionError) throw sessionError;
      toast({ title: "Session supprimée", description: "La session a été supprimée avec succès." });
      navigate("/profile");
    } catch (error: any) {
      console.error("[SessionDetails] Delete error:", error);
      toast({ title: "Erreur", description: "Impossible de supprimer la session: " + error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePaymentRedirect = (type: "session" | "subscription") => {
    if (!user) {
      const currentPath = `/session/${id}`;
      window.location.href = `/auth?returnTo=${encodeURIComponent(currentPath)}`;
      return;
    }
    if (type === "subscription") window.location.href = "/subscription";
    else window.location.href = `/payment/session/${id}`;
  };

  // ----------------- Dérivées stables -----------------
  const isHost = !!(user && session && session.host_id === user.id);
  const canSeeExactLocation = !!(session && (isHost || hasActiveSubscription));

  const start = useMemo<LatLng | null>(() => (session ? { lat: session.start_lat, lng: session.start_lng } : null), [session]);
  const end = useMemo<LatLng | null>(() => (session && session.end_lat && session.end_lng ? { lat: session.end_lat, lng: session.end_lng } : null), [session]);

  // ❗️Aucun marker de départ si l’utilisateur n’a pas accès au point exact
  const shownStart = useMemo<LatLng | null>(() => {
    if (!session || !start) return null;
    return canSeeExactLocation ? start : null;
  }, [session, start, canSeeExactLocation]);

  const fullRoutePath = useMemo<LatLng[]>(() => (session?.route_polyline ? pathFromPolyline(session.route_polyline) : []), [session]);

  // Tronquer le début si l'utilisateur ne voit pas le point exact
  const trimmedRoutePath = useMemo<LatLng[]>(() => {
    if (!fullRoutePath.length) return [];
    if (canSeeExactLocation) return fullRoutePath;
    const minTrim = 300; // sécurité minimale
    const trimMeters = Math.max(session?.blur_radius_m ?? 0, minTrim);
    return trimRouteStart(fullRoutePath, trimMeters);
  }, [fullRoutePath, canSeeExactLocation, session]);

  // Recentrage : si point exact visible => départ ; sinon => milieu du tracé tronqué ; fallback => zone approx.
  useEffect(() => {
    if (!session) return;
    if (canSeeExactLocation && start) {
      setCenter(start);
    } else if (trimmedRoutePath.length > 0) {
      const mid = trimmedRoutePath[Math.floor(trimmedRoutePath.length / 2)];
      setCenter(mid);
    } else {
      const approx = jitterDeterministic(session.start_lat, session.start_lng, session.blur_radius_m ?? 1000, session.id);
      setCenter(approx);
    }
  }, [session, canSeeExactLocation, start?.lat, start?.lng, trimmedRoutePath.length]);

  const mapOptions = useMemo(
    () => ({
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy" as const,
      zoomControl: true,
      scaleControl: false,
      rotateControl: false,
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
      ],
    }),
    []
  );

  const startMarkerIcon = useMemo(() => {
    const size = 18;
    const color = "#dc2626";
    const svg = `<svg width="${size}" height="${size + 6}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${size / 2} ${size + 6} L${size / 2 - 4} ${size - 2} Q${size / 2} ${size - 6} ${size / 2 + 4} ${size - 2} Z" fill="${color}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>`;
    const url = "data:image/svg+xml," + encodeURIComponent(svg);
    const g = typeof window !== "undefined" ? (window as any).google : undefined;
    return g?.maps?.Size && g?.maps?.Point
      ? { url, scaledSize: new g.maps.Size(size, size + 6), anchor: new g.maps.Point(size / 2, size + 6) }
      : { url };
  }, []);

  const endMarkerIcon = useMemo(() => {
    const size = 18;
    const color = "#ef4444";
    const svg = `<svg width="${size}" height="${size + 6}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${size / 2} ${size + 6} L${size / 2 - 4} ${size - 2} Q${size / 2} ${size - 6} ${size / 2 + 4} ${size - 2} Z" fill="${color}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>`;
    const url = "data:image/svg+xml," + encodeURIComponent(svg);
    const g = typeof window !== "undefined" ? (window as any).google : undefined;
    return g?.maps?.Size && g?.maps?.Point
      ? { url, scaledSize: new g.maps.Size(size, size + 6), anchor: new g.maps.Point(size / 2, size + 6) }
      : { url };
  }, []);

  // ----------------- Loading -----------------
  if (!session || !center) {
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

  const isSessionFull = participants.length >= session.max_participants;

  // ----------------- UI -----------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header + bouton retour */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{session.title}</h1>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(session.scheduled_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(session.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/map")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour aux sessions
              </Button>
              {isHost && (
                <Button variant="outline" size="sm" disabled={isDeleting} onClick={handleDeleteSession}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Grille responsive : mobile = carte d'abord ; desktop = colonne gauche + carte */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* ----- Carte Google Maps ----- */}
          <div className="order-1 lg:order-2 lg:col-span-2">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm h-full overflow-hidden">verflow
       <CardContent className=\"p-0\">-full">
                <div className="relative">
                  {/* Hauteur adaptée : + haute sur mobile pour être prioritaire */}
                  <div className="w-full h-[360px] sm:h-[420px] lg:h-[600px]">
                    <GoogleMap center={center} zoom={13} mapContainerStyle={{ width: "100%", height: "100%" }} options={mapOptions}>
                      {/* ❗️Marker départ uniquement si droit au point exact */}
                      {shownStart && <MarkerF position={shownStart} icon={startMarkerIcon} title="Point de départ (exact)" />}

                      {/* Arrivée si définie (toujours exacte) */}
                      {end && <MarkerF position={end} icon={endMarkerIcon} title="Point d'arrivée" />}

                      {/* Parcours exact (BLEU) — tronqué au début si nécessaire */}
                      {trimmedRoutePath.length > 1 && (
                        <Polyline path={trimmedRoutePath} options={{ clickable: false, strokeOpacity: 0.95, strokeWeight: 4, strokeColor: "#3b82f6" }} />
                      )}
                    </GoogleMap>
                  </div>

                  {/* Overlay infos (haut) — visible mobile & desktop */}
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
                              : `Le point de départ exact est masqué`}
                          </div>
                        </div>
                        {end && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium">Arrivée: </span>
                              {session.end_place || "Point d'arrivée défini"}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 💡 Callout en “hanging indent” */}
                      {!canSeeExactLocation && (
                        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700 grid grid-cols-[auto,1fr] gap-2 items-start">
                          <span aria-hidden="true">💡</span>
                          <span>
                            Abonnez-vous ou effectuez le paiement unique lié à la session pour voir le lieu de départ exact
                            (une partie du parcours reste visible pour tous, mais son début est masqué)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Panneau prévention — SANS cadre/bloc blanc (desktop & mobile) */}
            <div className="mt-3">
              <div className="px-1">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold text-center text-sm md:text-base text-gray-900">Rappels & sécurité</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-700">
                  <div className="flex items-start gap-2">
                    <span className="select-none">⏰</span>
                    <div>
                      <p className="font-medium">Ponctualité</p>
                      <p className="text-[11px] leading-snug">Arrive 5–10 minutes avant le départ. Le groupe attend au maximum 10 minutes après l’heure prévue.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="select-none">🤝</span>
                    <div>
                      <p className="font-medium">Bienveillance</p>
                      <p className="text-[11px] leading-snug">
                        MeetRun = sport + rencontre. Encourage les autres, respecte leur rythme et profite de l’expérience collective.
                        <span className="block">(<em>Tout comportement inapproprié ou irrespectueux peut entraîner une exclusion de la communauté.</em>)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="select-none">📱</span>
                    <div>
                      <p className="font-medium">Préviens en cas d’empêchement</p>
                      <p className="text-[11px] leading-snug">
                        Désinscris-toi avant le départ si tu ne peux plus venir. Ça aide l’hôte et les autres participants.
                        <span className="block">(<em>L’absence sans désinscription préalable peut entraîner une exclusion de la communauté.</em>)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="select-none">🌙</span>
                    <div>
                      <p className="font-medium">Vigilance en soirée</p>
                      <p className="text-[11px] leading-snug">
                        Certains parcours peuvent être peu éclairés, surtout à des heures tardives. Reste attentif(ve), courez/marchez en groupe et exercez votre vigilance.
                        <span className="block">(<em>Tous les profils sont vérifiés, mais le risque zéro n’existe pas : chacun reste responsable de sa sécurité.</em>)</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rejoindre — version mobile sous la carte */}
            {!isEnrolled && !isHost && (
              <div className="lg:hidden mt-4">
                <Card className="shadow-lg border-0">
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Rejoindre cette session</h3>
                    {isSessionFull ? (
                      <div className="text-center py-6">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-gray-600 font-medium">Session complète</p>
                        <p className="text-sm text-gray-500">Cette session a atteint sa capacité maximale</p>
                      </div>
                    ) : hasActiveSubscription ? (
                      <Button onClick={handleSubscribeOrEnroll} disabled={isLoading} className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
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
                        <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                          <div className="flex items-center gap-2 mb-2">
                            <Crown className="w-5 h-5 text-blue-600" />
                            <span className="font-semibold text-blue-900">Recommandé</span>
                          </div>
                          <h4 className="font-semibold mb-1">Abonnement MeetRun</h4>
                          <p className="text-sm text-gray-600 mb-3">Accès illimité à toutes les sessions • Lieux exacts • Sans frais par session</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-lg font-bold text-blue-600">9,99€/mois</span>
                            <Badge variant="secondary">Économique</Badge>
                          </div>
                          <Button onClick={() => handlePaymentRedirect("subscription")} className="w-full bg-blue-600 hover:bg-blue-700">
                            <Crown className="w-4 h-4 mr-2" />
                            S'abonner
                          </Button>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <h4 className="font-semibold mb-1">Paiement unique</h4>
                          <p className="text-sm text-gray-600 mb-3">Accès à cette session uniquement</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-lg font-bold">4,50€</span>
                            <span className="text-xs text-gray-500">une fois</span>
                          </div>
                          <Button variant="outline" onClick={() => handlePaymentRedirect("session")} className="w-full">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Payer maintenant
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* ----- Colonne gauche (desktop) / Section infos (mobile) ----- */}
          <div className="order-2 lg:order-1 lg:col-span-1 space-y-6">
            {/* Détails de la session */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {typeof session.distance_km === "number" && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {session.distance_km} km
                      </Badge>
                    )}
                    {session.intensity && (
                      <Badge variant={session.intensity === "marche" ? "default" : session.intensity === "course modérée" ? "secondary" : "destructive"}>
                        {session.intensity === "marche" ? "Marche" : session.intensity === "course modérée" ? "Course modérée" : "Course intensive"}
                      </Badge>
                    )}
                    {session.max_participants && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {participants.length + 1}/{session.max_participants}
                      </Badge>
                    )}
                    {session.session_type && (
                      <Badge variant={session.session_type === "mixed" ? "outline" : "secondary"} className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {session.session_type === "mixed" ? "Mixte" : session.session_type === "women_only" ? "Femmes uniquement" : "Hommes uniquement"}
                      </Badge>
                    )}
                  </div>

                  {session.description && (
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-sm text-gray-600">{session.description}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold mb-3">Organisateur</h3>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      {session.profiles?.avatar_url ? (
                        <img src={session.profiles.avatar_url} alt="Organisateur" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {session.profiles?.full_name?.charAt(0) || "O"}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{session.profiles?.full_name || "Organisateur"}</p>
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
                <h3 className="font-semibold mb-4">Participants ({participants.length + 1}/{session.max_participants})</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div key={participant.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                      {participant.profiles?.avatar_url ? (
                        <img src={participant.profiles.avatar_url} alt="Participant" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {(canSeeExactLocation || isHost) ? participant.profiles?.full_name || `Participant ${index + 1}` : `Participant ${index + 1}`}
                        </p>
                        {(canSeeExactLocation || isHost) && participant.profiles?.age && (
                          <p className="text-xs text-gray-500">{participant.profiles.age} ans</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Rejoindre — version desktop (dans la colonne gauche) */}
            {!isEnrolled && !isHost && (
              <div className="hidden lg:block">
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
                      <Button onClick={handleSubscribeOrEnroll} disabled={isLoading} className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
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
                        <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                          <div className="flex items-center gap-2 mb-2">
                            <Crown className="w-5 h-5 text-blue-600" />
                            <span className="font-semibold text-blue-900">Recommandé</span>
                          </div>
                          <h4 className="font-semibold mb-1">Abonnement MeetRun</h4>
                          <p className="text-sm text-gray-600 mb-3">Accès illimité à toutes les sessions • Lieux exacts • Sans frais par session</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-lg font-bold text-blue-600">9,99€/mois</span>
                            <Badge variant="secondary">Économique</Badge>
                          </div>
                          <Button onClick={() => handlePaymentRedirect("subscription")} className="w-full bg-blue-600 hover:bg-blue-700">
                            <Crown className="w-4 h-4 mr-2" />
                            S'abonner
                          </Button>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <h4 className="font-semibold mb-1">Paiement unique</h4>
                          <p className="text-sm text-gray-600 mb-3">Accès à cette session uniquement</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-lg font-bold">4,50€</span>
                            <span className="text-xs text-gray-500">une fois</span>
                          </div>
                          <Button variant="outline" onClick={() => handlePaymentRedirect("session")} className="w-full">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Payer maintenant
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {(isEnrolled || isHost) && (
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="text-center py-4">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" />
                    <p className="font-semibold text-green-700">{isHost ? "Vous êtes l'organisateur" : "Vous participez à cette session"}</p>
                    <p className="text-sm text-gray-600 mt-1">Rendez-vous au point de départ à l'heure prévue</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionDetails;
