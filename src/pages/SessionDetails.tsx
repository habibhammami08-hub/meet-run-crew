// src/pages/SessionDetails.tsx
// — Infos au-dessus de la carte, départ protégé (cercle 1200m pour non-abonnés), parcours bleu,
// — Paiement unique & abonnement via Edge Functions, layout mobile/desktop OK

import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { GoogleMap, MarkerF, Polyline, Circle } from "@react-google-maps/api";
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
  CheckCircle2

} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { getPublicProfiles } from "@/lib/cache/publicProfiles";
import { useToast } from "@/hooks/use-toast";
import polyline from "@mapbox/polyline";
import { isFreePromoActive } from "@/config/promo";

// -------------------- Panneau d'inscription (invité / non abonné) --------------------
// Une seule implémentation pour les deux emplacements de la fiche (mobile + desktop),
// pour que le prix, la date limite et le message restent identiques partout.

function SessionSignupPanel({
  onSignup,
  onSubscribe,
  isSubLoading,
}: {
  onSignup: () => void;
  onSubscribe: () => void;
  isSubLoading: boolean;
}) {
  const promo = isFreePromoActive();

  return (
    <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-blue-900">Recommandé</span>
      </div>
      <h4 className="font-semibold mb-1">{promo ? "MeetRun Unlimited offert" : "Abonnement MeetRun"}</h4>

      {promo ? (
        <>
          <p className="text-sm text-gray-600 mb-2">Dès l’inscription, automatiquement et sans carte bancaire</p>
          <ul className="mb-3 space-y-1.5">
            <li className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>Lieux exacts</span>
            </li>
            <li className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>Inscriptions aux sessions en illimité</span>
            </li>
          </ul>

          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-lg font-bold text-blue-600">0 €</span>
            <s className="text-sm font-normal text-muted-foreground">9,99 €/mois</s>
          </div>
          <p className="text-sm font-semibold text-blue-700 whitespace-nowrap mb-3">Offert jusqu’au 31/03/2027</p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">Accès illimité à toutes les sessions • Lieux exacts • Sans frais par session</p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold text-blue-600 whitespace-nowrap">9,99 €/mois</span>
            <Badge variant="secondary">Économique</Badge>
          </div>
        </>
      )}

      <Button
        onClick={promo ? onSignup : onSubscribe}
        disabled={isSubLoading}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        {isSubLoading ? "Ouverture..." : (<><Crown className="w-4 h-4 mr-2" />{promo ? "Créer mon compte" : "S'abonner"}</>)}
      </Button>
    </div>
  );
}

// -------------------- Utils --------------------


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
  const dLng = w / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat * Math.cos(t), lng: lng + dLng * Math.sin(t) };
}

function pathFromPolyline(p?: string | null): LatLng[] {
  if (!p) return [];
  try {
    return polyline.decode(p).map(([lat, lng]) => ({ lat, lng }));
  } catch {
    return [];
  }
}

// Coupe les X premiers mètres du tracé
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
    const d = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav)) * R;
    acc += d;
    if (acc >= meters) return path.slice(i);
  }
  return path.slice(-1);
}

function makeMarkerIcon(color: string) {
  const size = 18;
  const svg = `<svg width="${size}" height="${size + 6}" xmlns="http://www.w3.org/2000/svg">
    <path d="M${size / 2} ${size + 6} L${size / 2 - 4} ${size - 2} Q${size / 2} ${size - 6} ${size / 2 + 4} ${size - 2} Z" fill="${color}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`;
  const url = "data:image/svg+xml," + encodeURIComponent(svg);
  const g = typeof window !== "undefined" ? (window as any).google : undefined;
  return g?.maps?.Size && g?.maps?.Point
    ? { url, scaledSize: new g.maps.Size(size, size + 6), anchor: new g.maps.Point(size / 2, size + 6) }
    : { url };
}

// -------------------- Page --------------------

const SessionDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Checkout states
  const [isOneOffLoading, setIsOneOffLoading] = useState(false);
  const [isSubLoading, setIsSubLoading] = useState(false);

  // ⬅️ on récupère aussi refreshSubscription pour forcer un refresh après succès
  const { user, hasActiveSubscription, refreshSubscription } = useAuth();
  const { toast } = useToast();
  const supabase = getSupabase();

  // Map state
  const [center, setCenter] = useState<LatLng | null>(null);

  useEffect(() => {
    if (id) fetchSessionDetails();
  }, [id, user]); // eslint-disable-line

  // --------- Edge Functions checkout handlers ----------
  const redirectToAuth = () => {
    const currentPath = `/session/${id}`;
    window.location.href = `/auth?${isFreePromoActive() ? "mode=signup&" : ""}returnTo=${encodeURIComponent(currentPath)}`;
  };

  const checkGenderAllowed = async (): Promise<boolean> => {
    const type = (session as any)?.session_type;
    if (!user || !type || type === "mixed" || (session as any)?.host_id === user.id) return true;
    const { data } = await supabase.from("profiles").select("gender").eq("id", user.id).maybeSingle();
    const g = (data as any)?.gender?.toLowerCase();
    const ok = type === "men_only" ? g === "homme" : g === "femme";
    if (!ok) {
      toast({
        title: "Inscription impossible",
        description: g
          ? `Cette session est réservée aux ${type === "men_only" ? "hommes" : "femmes"}.`
          : "Cette session est réservée à un genre précis. Renseignez votre genre dans votre profil.",
        variant: "destructive",
      });
    }
    return ok;
  };

  const startOneOffCheckout = async () => {
    if (!user) return redirectToAuth();
    if (!id) return;
    if (!(await checkGenderAllowed())) return;

    setIsOneOffLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-session-payment", {
        body: { sessionId: id },
      });
      if (error) throw error;

      const url = (data as any)?.url || (data as any)?.checkout_url || (data as any)?.checkoutUrl;
      if (!url) throw new Error("L’Edge Function n’a pas renvoyé d’URL de paiement.");
      window.location.assign(url);
    } catch (e: any) {
      toast({
        title: "Paiement indisponible",
        description: e?.message || "La création de la session de paiement a échoué.",
        variant: "destructive",
      });
    } finally {
      setIsOneOffLoading(false);
    }
  };

  const startSubscriptionCheckout = async () => {
    if (!user) return redirectToAuth();
    if (!id) return;

    setIsSubLoading(true);
    try {
      const success_url = `${window.location.origin}/session/${id}?sub=success`;
      const cancel_url = `${window.location.origin}/session/${id}?sub=canceled`;

      const { data, error } = await supabase.functions.invoke("create-subscription-session", {
        body: { success_url, cancel_url },
      });
      if (error) throw error;

      const url = (data as any)?.url || (data as any)?.checkout_url || (data as any)?.checkoutUrl;
      if (!url) throw new Error("L’Edge Function n’a pas renvoyé d’URL d’abonnement.");
      window.location.assign(url);
    } catch (e: any) {
      toast({
        title: "Abonnement indisponible",
        description: e?.message || "Impossible d’ouvrir la page d’abonnement.",
        variant: "destructive",
      });
    } finally {
      setIsSubLoading(false);
    }
  };

  // Gestion des retours Stripe
  useEffect(() => {
    if (!id) return;

    const paymentStatus = searchParams.get("payment");
    const sid = searchParams.get("sid");
    if (paymentStatus === "success" && sid) {
      supabase.functions
        .invoke("verify-payment", { body: { sessionId: sid } })
        .finally(() => fetchSessionDetails());
      toast({ title: "Paiement réussi !", description: "Vous êtes maintenant inscrit à cette session." });
      navigate(`/session/${id}`, { replace: true });
      return;
    } else if (paymentStatus === "canceled") {
      toast({ title: "Paiement annulé", description: "Votre inscription n'a pas été finalisée.", variant: "destructive" });
      navigate(`/session/${id}`, { replace: true });
      return;
    }

    const sub = searchParams.get("sub");
    if (sub === "success") {
      Promise.resolve(refreshSubscription?.())
        .catch(() => {})
        .finally(() => {
          fetchSessionDetails();
          toast({
            title: "Abonnement activé 🎉",
            description: "Vous pouvez maintenant rejoindre cette session gratuitement.",
          });
          navigate(`/session/${id}`, { replace: true });
        });
    } else if (sub === "canceled") {
      toast({ title: "Abonnement annulé", description: "Aucun changement n'a été effectué.", variant: "destructive" });
      navigate(`/session/${id}`, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line

  // -----------------------------------------------------

  const fetchSessionDetails = async () => {
    // Session et participants demandés en parallèle ; profils publics via cache mémoire.
    const [{ data: rawSession, error }, { data: enrollmentRows }] = await Promise.all([
      supabase.from("sessions").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("enrollments_public").select("session_id, user_id, status").eq("session_id", id),
    ]);

    if (error) {
      console.error("Error fetching session:", error);
      toast({ title: "Erreur", description: "Impossible de charger les détails de la session.", variant: "destructive" });
      return;
    }
    const hostId = (rawSession as any)?.host_id as string | undefined;
    const participantIds = (enrollmentRows ?? []).map((e: any) => e.user_id);
    const byId = await getPublicProfiles(hostId ? [hostId, ...participantIds] : participantIds);

    let sessionData: any = rawSession;
    if (rawSession) {
      sessionData = { ...rawSession, profiles: (hostId && byId.get(hostId)) ?? null };
    }

    if (sessionData) {
      setSession(sessionData);
      const canSeeExact = !!(user && sessionData.host_id === user.id) || !!hasActiveSubscription || !!isEnrolled;
      const start = { lat: sessionData.start_lat, lng: sessionData.start_lng } as LatLng;
      const shown = canSeeExact
        ? start
        : jitterDeterministic(start.lat, start.lng, sessionData.blur_radius_m ?? 1200, sessionData.id);
      setCenter(shown);
    }

    // Vue publique : tout le monde (même non connecté) voit les participants confirmés,
    // sans exposer les données de paiement de la table enrollments.
    if (enrollmentRows) {
      const participantsData = enrollmentRows.map((e: any) => ({ ...e, profiles: byId.get(e.user_id) ?? null }));
      setParticipants(participantsData);
      if (user) setIsEnrolled(!!participantsData.find((p: any) => p.user_id === user.id));
    }
  };

  const handleSubscribeOrEnroll = async () => {
    if (!user) {
      const currentPath = `/session/${id}`;
      window.location.href = `/auth?${isFreePromoActive() ? "mode=signup&" : ""}returnTo=${encodeURIComponent(currentPath)}`;
      return;
    }
    if (!session) return;
    if (!(await checkGenderAllowed())) return;

    if (hasActiveSubscription) {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from("enrollments")
          .insert({ session_id: session.id, user_id: user.id, status: "included_by_subscription" });
        if (error) throw error;
        toast({ title: "Inscription réussie !", description: "Vous êtes maintenant inscrit à cette session." });
        fetchSessionDetails();
      } catch (err: any) {
        console.error("Error enrolling:", err);
        const isLimit = typeof err?.message === "string" && err.message.includes("3 sessions");
        toast({
          title: isLimit ? "Limite atteinte" : "Erreur",
          description: isLimit
            ? "Vous êtes déjà inscrit(e) à 3 sessions à venir. Dès qu'une session est passée, vous pourrez vous inscrire à une nouvelle."
            : err.message,
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
      const { error: enrollmentsError } = await supabase.from("enrollments").delete().eq("session_id", session.id);
      if (enrollmentsError) throw enrollmentsError;
      const { error: sessionError } = await supabase.from("sessions").delete().eq("id", session.id).eq("host_id", user.id);
      if (sessionError) throw sessionError;
      toast({ title: "Session supprimée", description: "La session a été supprimée avec succès." });
      navigate("/map");
    } catch (err: any) {
      console.error("[SessionDetails] Delete error:", err);
      toast({ title: "Erreur", description: "Impossible de supprimer la session: " + err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  // ------- Dérivées stables -------
  const isHost = !!(user && session && session.host_id === user.id);
  const canSeeExactLocation = !!(session && (isHost || hasActiveSubscription || isEnrolled));

  const start = useMemo<LatLng | null>(() => (session ? { lat: session.start_lat, lng: session.start_lng } : null), [session]);
  const end = useMemo<LatLng | null>(
    () => (session && session.end_lat && session.end_lng ? { lat: session.end_lat, lng: session.end_lng } : null),
    [session]
  );

  const shownStart = useMemo<LatLng | null>(() => {
    if (!session || !start) return null;
    if (canSeeExactLocation) return start;
    const j = jitterDeterministic(start.lat, start.lng, session.blur_radius_m ?? 1200, session.id);
    return { lat: j.lat, lng: j.lng };
  }, [session, start, canSeeExactLocation]);

  const fullRoutePath = useMemo<LatLng[]>(() => (session?.route_polyline ? pathFromPolyline(session.route_polyline) : []), [session]);

  const trimmedRoutePath = useMemo<LatLng[]>(() => {
    if (!fullRoutePath.length) return [];
    if (canSeeExactLocation) return fullRoutePath;
    const minTrim = 300; // sécurité minimale
    const trimMeters = Math.max(session?.blur_radius_m ?? 0, minTrim);
    return trimRouteStart(fullRoutePath, trimMeters);
  }, [fullRoutePath, canSeeExactLocation, session]);

  // ✅ Date/heure formatées (utilisées dans le badge)
  const formattedDate = useMemo(
    () =>
      session
        ? new Date(session.scheduled_at).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        : "",
    [session]
  );
  const formattedTime = useMemo(
    () =>
      session
        ? new Date(session.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "",
    [session]
  );

  // Recentrage si le point visible change
  useEffect(() => {
    if (shownStart && (center?.lat !== shownStart.lat || center?.lng !== shownStart.lng)) {
      setCenter(shownStart);
    }
  }, [shownStart?.lat, shownStart?.lng]); // eslint-disable-line

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
        { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
      ]
    }),
    []
  );

  const startMarkerIcon = useMemo(() => makeMarkerIcon("#16a34a"), []);
  const endMarkerIcon = useMemo(() => makeMarkerIcon("#ef4444"), []);

  // ------- Early return après hooks -------
  if (!session || !shownStart || !center) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-deep/5">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Chargement de la session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isSessionFull = participants.length >= session.max_participants;

  // ------- Helpers (RPC unifiée) -------
  const callRpcLeaveOrDelete = async () => {
    if (!session) return;
    try {
      console.log("[callRpcLeaveOrDelete] Appel RPC pour session:", session.id);
      const { data, error } = await supabase.rpc("leave_or_delete_session", { p_session_id: session.id });
      console.log("[callRpcLeaveOrDelete] Résultat RPC:", { data, error });
      
      if (error) throw error;
      const action = (data as any)?.action;
      console.log("[callRpcLeaveOrDelete] Action détectée:", action);

      if (action === "deleted") {
        console.log("[callRpcLeaveOrDelete] Session supprimée, redirection vers /map");
        toast({ title: "Session supprimée", description: "La session a été supprimée avec succès." });
        navigate("/map");
        return;
      }

      if (action === "host_reassigned") {
        toast({ title: "Vous avez quitté l’hôte", description: "L’hôte a été réassigné au participant le plus ancien." });
      } else if (action === "unenrolled") {
        toast({ title: "Désinscription réussie", description: "Vous n’êtes plus inscrit à cette session." });
      } else {
        // noop ou autre
        toast({ title: "Action effectuée", description: "Mise à jour de la session." });
      }

      await fetchSessionDetails();
    } catch (e: any) {
      console.error("[callRpcLeaveOrDelete] Erreur:", e);
      toast({ title: "Erreur", description: e?.message || "Action impossible pour le moment.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-deep/5">
      {/* ⬅️ Retour : pastille flottante en haut à gauche (opaque, sans bande) */}
      <div className="sticky top-0 z-40 pointer-events-none">
        <div className="container mx-auto max-w-7xl px-4 py-2.5 pointer-events-none">
          <button
            type="button"
            onClick={() => navigate("/map")}
            aria-label="Retour aux sessions"
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-black/5 transition hover:text-gray-900 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-3 pb-6 max-w-7xl">
        {/* Header */}
        <div className="mb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 flex items-baseline gap-2">
              <span className="truncate" title={session.title}>{session.title}</span>
              {isHost && (
                <span
                  aria-label="Vous êtes l'hôte de cette session"
                  className="shrink-0 text-xs md:text-sm font-normal text-gray-500"
                >
                  (Vous êtes l’hôte)
                </span>
              )}
            </h1>

            {/* ✅ Badge date/heure (desktop & mobile) */}
            <div className="flex items-center">
              <div
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700 font-semibold whitespace-nowrap overflow-x-auto"
                aria-label="Date et heure de la session"
              >
                <Calendar className="w-4 h-4 flex-shrink-0 text-blue-600" />
                <span className="text-sm md:text-base">
                  {formattedDate} • {formattedTime}
                </span>
              </div>
            </div>
          </div>

          {/** ⛔️ Boutons hôte/participant retirés du header : ils sont désormais sous les participants */}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche (desktop) - Détails / Participants / Actions (desktop only) */}
          <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">
            {/* Détails */}
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
                      <Badge
                        variant={
                          session.intensity === "marche" ? "default" : session.intensity === "course modérée" ? "secondary" : "destructive"
                        }
                      >
                        {session.intensity === "marche"
                          ? "Marche"
                          : session.intensity === "course modérée"
                          ? "Course modérée"
                          : "Course intensive"}
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
                        {session.session_type === "mixed"
                          ? "Mixte"
                          : session.session_type === "women_only"
                          ? "Femmes uniquement"
                          : "Hommes uniquement"}
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
                    <button
                      type="button"
                      onClick={() => session.host_id && navigate(`/runner/${session.host_id}`)}
                      className="w-full flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition text-left group"
                    >
                      {session.profiles?.avatar_url ? (
                        <img src={session.profiles.avatar_url} alt="Organisateur" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {session.profiles?.full_name?.charAt(0) || "O"}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium group-hover:text-blue-700">{session.profiles?.full_name || "Organisateur"}</p>
                        <p className="text-sm text-gray-600">
                          {session.profiles?.age} ans {session.profiles?.city && `• ${session.profiles.city}`}
                        </p>
                      </div>
                      <span className="text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition">Voir le profil →</span>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Participants ({participants.length}/{session.max_participants})</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <button
                      type="button"
                      key={participant.id}
                      onClick={() => participant.user_id && navigate(`/runner/${participant.user_id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition text-left"
                    >
                      {participant.profiles?.avatar_url ? (
                        <img src={participant.profiles.avatar_url} alt="Participant" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-deep rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {participant.profiles?.full_name || `Participant ${index + 1}`}
                        </p>
                        {participant.profiles?.age && (
                          <p className="text-xs text-gray-500">{participant.profiles.age} ans</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions sous les participants — Desktop only */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm hidden lg:block">
              <CardContent className="p-6">
                {/* Affichage conditionnel au même emplacement que 'Rejoindre' */}
                {!isHost && !isEnrolled && (
                  <>
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
                        className="w-full h-12 bg-deep hover:bg-deep/90"
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Inscription...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Rejoindre
                          </div>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <SessionSignupPanel
                          onSignup={redirectToAuth}
                          onSubscribe={startSubscriptionCheckout}
                          isSubLoading={isSubLoading}
                        />

                      </div>
                    )}
                  </>
                )}

                {/* Participant déjà inscrit → bouton 'Se désinscrire' ici */}
                {!isHost && isEnrolled && (() => {
                  const now = Date.now();
                  const sessionTime = new Date(session.scheduled_at).getTime();
                  const minutesUntil = (sessionTime - now) / 60000;
                  const canUnenroll = minutesUntil >= 30;

                  return canUnenroll ? (
                    <Button
                      className="w-full h-12"
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm("Voulez-vous vraiment vous désinscrire de cette session ?")) return;
                        await callRpcLeaveOrDelete();
                      }}
                    >
                      Se désinscrire
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-12"
                      variant="destructive"
                      disabled
                      title="Désinscription impossible moins de 30 minutes avant le début"
                    >
                      Se désinscrire
                    </Button>
                  );
                })()}

                {/* Hôte → bouton déplacé ici (ROUGE) */}
                {isHost && (() => {
                  const now = Date.now();
                  const sessionTime = new Date(session.scheduled_at).getTime();
                  const minutesUntil = (sessionTime - now) / 60000;
                  const canAct = minutesUntil >= 30;
                  const hasOtherParticipants = participants.length > 0;
                  const label = hasOtherParticipants ? "Se désinscrire" : "Supprimer";

                  return canAct ? (
                    <Button
                      className="w-full h-12"
                      variant="destructive"   // ⬅️ rouge
                      disabled={isDeleting}
                      onClick={async () => {
                        const question = hasOtherParticipants
                          ? "Vous êtes l’hôte et au moins un autre participant est inscrit. Voulez-vous vous désinscrire ? (l’hôte sera réassigné)"
                          : "Vous êtes l’hôte et le seul participant. Supprimer cette session ?";
                        if (!confirm(question)) return;
                        
                        // Si pas d'autres participants, suppression directe
                        if (!hasOtherParticipants) {
                          await handleDeleteSession();
                        } else {
                          // Sinon, utiliser la RPC pour gérer la réassignation
                          await callRpcLeaveOrDelete();
                        }
                      }}
                    >
                      {hasOtherParticipants ? null : <Trash2 className="w-4 h-4 mr-2" />}
                      {label}
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-12"
                      variant="destructive"   // ⬅️ rouge même désactivé
                      disabled
                      title={hasOtherParticipants ? "Désinscription impossible moins de 30 minutes avant le début" : "Suppression impossible moins de 30 minutes avant le début"}
                    >
                      {hasOtherParticipants ? "Se désinscrire" : "Supprimer"}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite — Infos AU-DESSUS de la carte + Carte + Rappels */}
          <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
            {/* Bloc infos AU-DESSUS de la carte */}
            <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-sm border">
              {!canSeeExactLocation && (
                <div className="text-xs text-blue-700 bg-blue-50 rounded p-3 mb-3">
                  <div className="grid grid-cols-[1.25rem,1fr] gap-2">
                    <div className="leading-5">💡</div>
                    <div>
                      <div className="font-medium">
                        {isFreePromoActive() ? "Créez un compte pour bénéficier automatiquement de MeetRun Unlimited offert jusqu’au 31 mars 2027 et vous inscrire à cette session." : "Abonnez-vous ou effectuez le paiement unique lié à la session pour voir le lieu de départ exact."}
                      {" "}<span className="font-normal">(une partie du parcours reste visible pour tous, mais son début est masqué)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-deep mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">Départ : </span>
                    {canSeeExactLocation
                      ? (session.location_hint || session.start_place || "Coordonnées exactes disponibles")
                      : "Départ masqué"}
                  </div>
                </div>
                {end && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Arrivée : </span>
                      {session.end_place || "Point d'arrivée défini"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Carte */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="w-full h-[55vh] lg:h-[600px]">
                  <GoogleMap center={center} zoom={13} mapContainerStyle={{ width: "100%", height: "100%" }} options={mapOptions}>
                    {canSeeExactLocation && start && (
                      <MarkerF position={start} icon={startMarkerIcon} title="Point de départ (exact)" />
                    )}
                    {!canSeeExactLocation && start && (
                      <Circle
                        center={start}
                        radius={1200}
                        options={{
                          fillColor: "#3b82f6",
                          fillOpacity: 0.08,
                          strokeColor: "#3b82f6",
                          strokeOpacity: 0.35,
                          strokeWeight: 2,
                          clickable: false,
                          draggable: false,
                          editable: false,
                          zIndex: 1
                        }}
                      />
                    )}
                    {end && <MarkerF position={end} icon={endMarkerIcon} title="Point d'arrivée" />}
                    {trimmedRoutePath.length > 1 && (
                      <Polyline
                        path={trimmedRoutePath}
                        options={{ clickable: false, strokeOpacity: 0.95, strokeWeight: 4, strokeColor: "#3b82f6" }}
                      />
                    )}
                  </GoogleMap>
                </div>
              </CardContent>
            </Card>

            {/* Rappels & sécurité — sous la carte */}
            <div className="mt-6">
              <h3 className="text-center text-lg md:text-xl font-bold text-gray-900 mb-4">🛡️ Rappels & sécurité</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="select-none">⏰</span>
                  <div>
                    <p className="font-medium">Ponctualité</p>
                    <p className="text-[12px] leading-snug">
                      Arrive 5–10 minutes avant le départ. Le groupe attend au maximum 10 minutes après l’heure prévue.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="select-none">🤝</span>
                  <div>
                    <p className="font-medium">Bienveillance</p>
                    <p className="text-[12px] leading-snug">
                      MeetRun = sport + rencontre. Encourage les autres, respecte leur rythme et profite de l’expérience collective.
                      <span className="block">
                        <em>Tout comportement inapproprié ou irrespectueux peut entraîner une exclusion de la communauté.</em>
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="select-none">📱</span>
                  <div>
                    <p className="font-medium">Préviens en cas d’empêchement</p>
                    <p className="text-[12px] leading-snug">
                      Désinscris-toi avant le départ si tu ne peux plus venir. Ça aide l’hôte et les autres participants.
                      <span className="block">
                        <em>L’absence sans désinscription préalable peut entraîner une exclusion de la communauté.</em>
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="select-none">🌙</span>
                  <div>
                    <p className="font-medium">Vigilance en soirée</p>
                    <p className="text-[12px] leading-snug">
                      Certains parcours peuvent être peu éclairés, surtout à des heures tardives. Reste attentif(ve), courez/marchez en groupe et
                      exercez votre vigilance.
                      <span className="block">
                        <em>
                          Tous les profils sont vérifiés, mais le risque zéro n’existe pas : chacun reste responsable de sa sécurité.
                        </em>
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* (Mobile) Le bloc d'actions est en bas de page */}
          </div>
        </div>

        {/* Actions — Mobile only (EN DERNIER, sous toute la page) */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm lg:hidden mt-6">
          <CardContent className="p-6">
            {/* Même emplacement mobile que 'Rejoindre' */}
            {!isHost && !isEnrolled ? (
              <>
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
                    className="w-full h-12 bg-deep hover:bg-deep/90"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Inscription...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Rejoindre
                      </div>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <SessionSignupPanel
                      onSignup={redirectToAuth}
                      onSubscribe={startSubscriptionCheckout}
                      isSubLoading={isSubLoading}
                    />

                  </div>
                )}
              </>
            ) : null}

            {!isHost && isEnrolled && (() => {
              const now = Date.now();
              const sessionTime = new Date(session.scheduled_at).getTime();
              const minutesUntil = (sessionTime - now) / 60000;
              const canUnenroll = minutesUntil >= 30;

              return canUnenroll ? (
                <Button
                  className="w-full h-12"
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm("Voulez-vous vraiment vous désinscrire de cette session ?")) return;
                    await callRpcLeaveOrDelete();
                  }}
                >
                  Se désinscrire
                </Button>
              ) : (
                <Button
                  className="w-full h-12"
                  variant="destructive"
                  disabled
                  title="Désinscription impossible moins de 30 minutes avant le début"
                >
                  Se désinscrire
                </Button>
              );
            })()}

            {isHost && (() => {
              const now = Date.now();
              const sessionTime = new Date(session.scheduled_at).getTime();
              const minutesUntil = (sessionTime - now) / 60000;
              const canAct = minutesUntil >= 30;
              const hasOtherParticipants = participants.length > 0;
              const label = hasOtherParticipants ? "Se désinscrire" : "Supprimer";

              return canAct ? (
                <Button
                  className="w-full h-12"
                  variant="destructive"   // ⬅️ rouge
                  disabled={isDeleting}
                  onClick={async () => {
                    const question = hasOtherParticipants
                      ? "Vous êtes l’hôte et au moins un autre participant est inscrit. Voulez-vous vous désinscrire ? (l’hôte sera réassigné)"
                      : "Vous êtes l’hôte et le seul participant. Supprimer cette session ?";
                    if (!confirm(question)) return;
                    await callRpcLeaveOrDelete();
                  }}
                >
                  {hasOtherParticipants ? null : <Trash2 className="w-4 h-4 mr-2" />}
                  {label}
                </Button>
              ) : (
                <Button
                  className="w-full h-12"
                  variant="destructive"   // ⬅️ rouge même désactivé
                  disabled
                  title={hasOtherParticipants ? "Désinscription impossible moins de 30 minutes avant le début" : "Suppression impossible moins de 30 minutes avant le début"}
                >
                  {hasOtherParticipants ? "Se désinscrire" : "Supprimer"}
                </Button>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SessionDetails;
