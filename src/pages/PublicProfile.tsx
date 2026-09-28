// src/pages/PublicProfile.tsx
// Page de profil public d'un membre MeetRun — accessible à tous, même sans compte.
// Affiche tout sauf e-mail et téléphone (vue profiles_public_open).

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PhotoLightbox from "@/components/PhotoLightbox";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  Route as RouteIcon,
  Flame,
  Footprints,
  Sparkles,
  Clock,
  ChevronRight,
  Maximize2,
} from "lucide-react";

type PublicProfileData = {
  id: string;
  full_name: string | null;
  age: number | null;
  avatar_url: string | null;
  gender: string | null;
  city: string | null;
  sessions_hosted: number | null;
  sessions_joined: number | null;
  total_km: number | null;
  created_at: string | null;
};

type HostedSession = {
  id: string;
  title: string;
  scheduled_at: string;
  distance_km: number;
  intensity: string;
  session_type: string;
  start_place: string | null;
  participants_count: number;
  max_participants: number;
};

const typeMeta: Record<string, { label: string; className: string }> = {
  mixed: { label: "Mixte", className: "bg-gradient-to-r from-emerald-400 via-emerald-500 to-green-600 text-white border-0" },
  women_only: { label: "Femmes uniquement", className: "bg-gradient-to-r from-rose-400 via-rose-500 to-red-600 text-white border-0" },
  men_only: { label: "Hommes uniquement", className: "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 text-white border-0" },
};

const intensityLabel: Record<string, string> = {
  low: "Marche",
  medium: "Course modérée",
  high: "Course intensive",
};

const genderLabel: Record<string, string> = {
  male: "Homme",
  female: "Femme",
  homme: "Homme",
  femme: "Femme",
};

const PublicProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [hostedSessions, setHostedSessions] = useState<HostedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data, error } = await (supabase as any)
        .from("profiles_public_open")
        .select("id, full_name, age, avatar_url, gender, city, sessions_hosted, sessions_joined, total_km, created_at")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(data);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, scheduled_at, distance_km, intensity, session_type, start_place, participants_count, max_participants")
        .eq("host_id", id)
        .eq("status", "published")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(6);

      setHostedSessions((sessions as HostedSession[]) ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#151515] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#151515] flex flex-col items-center justify-center text-white gap-4 px-6 text-center">
        <p className="text-xl font-semibold">Ce profil est introuvable</p>
        <p className="text-white/60 text-sm">Le membre a peut-être supprimé son compte.</p>
        <Button onClick={() => navigate("/map")} className="bg-emerald-500 hover:bg-emerald-600 text-white">
          Voir les sessions
        </Button>
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "Runner";
  const initial = profile.full_name?.charAt(0)?.toUpperCase() || "R";
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;
  const km = Math.round(Number(profile.total_km ?? 0));
  const fullName = profile.full_name?.trim() || firstName;
  const photoCaption = [
    profile.age ? `${profile.age} ans` : null,
    genderLabel[(profile.gender ?? "").toLowerCase()],
    profile.city,
  ]
    .filter(Boolean)
    .join(" · ");

  const stats = [
    { icon: Sparkles, label: "Sessions organisées", value: profile.sessions_hosted ?? 0, accent: "text-amber-400" },
    { icon: Users, label: "Sessions rejointes", value: profile.sessions_joined ?? 0, accent: "text-sky-400" },
    { icon: RouteIcon, label: "Kilomètres parcourus", value: km, accent: "text-emerald-400" },
  ];

  return (
    <div className="min-h-screen bg-[#151515] text-white">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 bg-gradient-to-b from-[#101111] to-[#2c2d2c] border-b border-white/10">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <Link to="/" className="text-lg font-extrabold tracking-tight">
            meet<span className="text-emerald-400">run</span>
          </Link>
          <div className="w-14" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-16">
        {/* En-tête profil */}
        <div className="flex flex-col items-center pt-10 pb-8 text-center">
          <div className="relative">
            {profile.avatar_url ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                aria-label={`Voir la photo de ${fullName} en grand`}
                className="group relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="block p-1 rounded-full bg-gradient-to-tr from-emerald-400 via-sky-500 to-rose-500 transition-transform duration-300 group-hover:scale-105 group-active:scale-95">
                  <img
                    src={profile.avatar_url}
                    alt={firstName}
                    className="w-28 h-28 rounded-full object-cover border-4 border-[#151515]"
                  />
                </span>
                <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#151515] bg-white/20 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
            ) : (
              <div className="p-1 rounded-full bg-gradient-to-tr from-emerald-400 via-sky-500 to-rose-500">
                <div className="w-28 h-28 rounded-full border-4 border-[#151515] bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-4xl font-bold">
                  {initial}
                </div>
              </div>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            {firstName}
            {profile.age ? <span className="text-white/60 font-semibold">, {profile.age} ans</span> : null}
          </h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-white/70">
            {profile.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" /> {profile.city}
              </span>
            )}
            {profile.gender && genderLabel[profile.gender.toLowerCase()] && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-white/30" />
                {genderLabel[profile.gender.toLowerCase()]}
              </span>
            )}
            {memberSince && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-white/30" />
                Membre depuis {memberSince}
              </span>
            )}
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(({ icon: Icon, label, value, accent }) => (
            <div
              key={label}
              className="rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col items-center text-center"
            >
              <Icon className={`w-5 h-5 mb-2 ${accent}`} />
              <p className="text-2xl font-extrabold leading-none">{value}</p>
              <p className="mt-1.5 text-[11px] leading-tight text-white/60">{label}</p>
            </div>
          ))}
        </div>

        {/* Sessions à venir organisées par ce membre */}
        <section className="mt-10">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-emerald-400" />
            Sessions organisées par {firstName}
          </h2>

          {hostedSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <Footprints className="w-8 h-8 mx-auto text-white/30 mb-3" />
              <p className="text-white/60 text-sm">
                Aucune session à venir pour le moment.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {hostedSessions.map((s) => {
                const meta = typeMeta[s.session_type] ?? typeMeta.mixed;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/session/${s.id}`)}
                    className="w-full text-left rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.08] hover:border-emerald-500/40 transition group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{s.title}</p>
                        <p className="mt-1 text-xs text-white/60 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(s.scheduled_at).toLocaleDateString("fr-FR", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          <Clock className="w-3.5 h-3.5 ml-1" />
                          {new Date(s.scheduled_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {s.start_place && (
                          <p className="mt-1 text-xs text-white/50 flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 shrink-0" /> {s.start_place}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-emerald-400 shrink-0 mt-1 transition" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className={meta.className}>{meta.label}</Badge>
                      <Badge variant="outline" className="border-white/20 text-white/70">
                        {intensityLabel[s.intensity] ?? s.intensity}
                      </Badge>
                      <Badge variant="outline" className="border-white/20 text-white/70">
                        {s.distance_km} km
                      </Badge>
                      <span className="ml-auto text-xs text-white/50 inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> {s.participants_count}/{s.max_participants}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <PhotoLightbox
        open={photoOpen}
        src={profile.avatar_url}
        name={fullName}
        caption={photoCaption}
        onClose={() => setPhotoOpen(false)}
      />
    </div>
  );
};

export default PublicProfile;
