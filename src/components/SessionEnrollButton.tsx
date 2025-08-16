import { useState } from "react";
import { getSupabase, getCurrentUserSafe } from "@/integrations/supabase/client";

interface SessionEnrollButtonProps {
  sessionId: string;
  sessionTitle: string;
  isEnrolled?: boolean;
  onEnrollmentChange?: () => void;
}

export default function SessionEnrollButton({ 
  sessionId, 
  sessionTitle, 
  isEnrolled = false,
  onEnrollmentChange 
}: SessionEnrollButtonProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState(isEnrolled);

  const handleEnrollment = async () => {
    if (!supabase) {
      alert("Configuration Supabase manquante.");
      return;
    }

    setLoading(true);
    try {
      console.info("[enrollment] action:", enrolled ? "leave" : "join", "session:", sessionId);

      const { user, source } = await getCurrentUserSafe({ timeoutMs: 5000 });
      console.info("[enrollment] current user:", { hasUser: !!user, source });
      
      if (!user) {
        alert("Veuillez vous connecter pour rejoindre une session.");
        return;
      }

      if (enrolled) {
        // Désinscription
        const { error } = await supabase
          .from("enrollments")
          .delete()
          .eq("session_id", sessionId)
          .eq("user_id", user.id);

        if (error) {
          console.error("[enrollment] unenroll error", error);
          alert("Impossible de vous désinscrire : " + error.message);
          return;
        }

        console.info("[enrollment] unenrolled successfully");
        setEnrolled(false);
        alert("Vous êtes désinscrit de " + sessionTitle);
      } else {
        // Inscription
        const { data, error } = await supabase
          .from("enrollments")
          .insert({
            session_id: sessionId,
            user_id: user.id,
            status: "confirmed"
          })
          .select("id")
          .single();

        if (error) {
          console.error("[enrollment] enroll error", error);
          alert("Impossible de vous inscrire : " + error.message);
          return;
        }

        console.info("[enrollment] enrolled successfully", data);
        setEnrolled(true);
        alert("Vous êtes inscrit à " + sessionTitle + " 🎉");

        // Vérifier le profil mis à jour
        setTimeout(async () => {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("sessions_joined, total_km")
              .eq("id", user.id)
              .single();
            console.info("[enrollment] profile after enrollment:", profile);
          } catch (e) {
            console.error("[enrollment] error fetching updated profile:", e);
          }
        }, 1000);
      }

      onEnrollmentChange?.();
    } catch (e: any) {
      console.error("[enrollment] fatal error", e);
      alert("Erreur lors de l'inscription/désinscription.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
        enrolled
          ? "bg-red-100 text-red-700 border border-red-200 hover:bg-red-200"
          : "bg-green-100 text-green-700 border border-green-200 hover:bg-green-200"
      }`}
      disabled={loading}
      onClick={handleEnrollment}
    >
      {loading 
        ? "Traitement..." 
        : enrolled 
          ? "Se désinscrire" 
          : "Rejoindre"
      }
    </button>
  );
}