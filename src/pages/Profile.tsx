// ProfilePage.tsx (version sans .abortSignal, compatible toutes versions supabase-js)
// - Anti N+1 avec enrollments(count)
// - Counts allégés avec head:true
// - Anti "spinner infini" via requestId + finally fiable

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import AccountDeletionComponent from "@/components/AccountDeletionComponent";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

type Profile = {
  id: string;
  full_name: string;
  age?: number | null;
  city?: string | null;
  sport_level?: "Occasionnel" | "Confirmé" | "Athlète" | null;
  avatar_url?: string | null;
  sessions_hosted?: number;
  sessions_joined?: number;
  total_km?: number;
  total_distance_hosted_km?: number;
};

type Session = {
  id: string;
  title: string;
  scheduled_at: string;
  start_place?: string;
  distance_km?: number;
  intensity?: string;
  max_participants: number;
  current_participants: number;
  status: string;
};

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Form
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [city, setCity] = useState("");
  const [sportLevel, setSportLevel] = useState<"Occasionnel" | "Confirmé" | "Athlète">("Occasionnel");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const supabase = getSupabase();

  // Sécurité
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0); // pour invalider les réponses obsolètes

  // -------- FETCH SESSIONS (sans N+1) ----------
  const fetchMySessions = useCallback(async (userId: string, myId: number) => {
    if (!supabase || !userId || !mountedRef.current) return;

    try {
      console.log("[Profile] Fetching sessions (with enrollments count) for user:", userId);

      // Nécessite FK enrollments.session_id -> sessions.id
      const { data, error } = await supabase
        .from("sessions")
        .select(`
          id,
          title,
          scheduled_at,
          start_place,
          distance_km,
          intensity,
          max_participants,
          status,
          enrollments:enrollments(count)
        `)
        .eq("host_id", userId)
        .in("status", ["published", "active"])
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: false });

      if (error) {
        console.error("[Profile] Error fetching sessions:", error);
        return;
      }

      const withCounts: Session[] = (data ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        scheduled_at: s.scheduled_at,
        start_place: s.start_place ?? undefined,
        distance_km: s.distance_km ?? undefined,
        intensity: s.intensity ?? undefined,
        max_participants: s.max_participants,
        status: s.status,
        current_participants: ((s.enrollments?.[0]?.count ?? 0) + 1),
      }));

      if (!mountedRef.current || myId !== reqIdRef.current) return;
      setMySessions(withCounts);
    } catch (e) {
      console.error("[Profile] Error fetching sessions:", e);
    }
  }, [supabase]);

  // -------- UPDATE STATS (count sans rapatrier) ----------
  const updateProfileStats = useCallback(async (userId: string, myId: number) => {
    if (!supabase || !userId || !mountedRef.current) return;

    try {
      console.log("[Profile] Updating profile statistics for user:", userId);

      const [hostedRes, joinedRes] = await Promi
