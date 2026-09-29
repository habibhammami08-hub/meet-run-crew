import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import mark from "@/assets/meetrun-mark-white.png";

const SEEN_KEY = "meetrun_splash_seen";
const WORD = "MeetRun";

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  // Dans l'app native : l'écran de démarrage joue à chaque ouverture.
  if (Capacitor.isNativePlatform()) return true;
  // Sur le web : une seule fois par session de navigation, ou si on le force.
  try {
    if (new URLSearchParams(window.location.search).has("splash")) return true;
    return window.sessionStorage.getItem(SEEN_KEY) === null;
  } catch {
    return true;
  }
}

export default function AppSplash() {
  const [active] = useState(shouldShow);
  const [phase, setPhase] = useState<"run" | "leaving" | "gone">(() =>
    active ? "run" : "gone",
  );

  useEffect(() => {
    if (!active) return;
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* stockage indisponible : on joue l'animation quand même */
    }
    // Petit son d'intro, synchronisé avec l'animation. Si le navigateur
    // bloque la lecture automatique, on ignore silencieusement.
    try {
      const audio = new Audio(`${import.meta.env.BASE_URL}splash-intro.mp3`);
      audio.volume = 0.6;
      void audio.play().catch(() => {});
    } catch {
      /* audio indisponible : l'animation reste seule */
    }
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const hold = reduce ? 700 : 2350;
    const fade = reduce ? 150 : 520;
    const leaving = window.setTimeout(() => setPhase("leaving"), hold);
    const gone = window.setTimeout(() => setPhase("gone"), hold + fade);
    return () => {
      window.clearTimeout(leaving);
      window.clearTimeout(gone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`app-splash${phase === "leaving" ? " is-leaving" : ""}`}
      role="status"
      aria-label="MeetRun"
    >
      <div className="app-splash__glow" />
      <div className="app-splash__inner">
        <img
          src={mark}
          alt=""
          className="app-splash__mark"
          draggable={false}
        />
        <span className="app-splash__word">
          {WORD.split("").map((char, i) => (
            <span
              key={`${char}-${i}`}
              className="app-splash__letter"
              style={{ ["--i" as string]: String(i) } as React.CSSProperties}
            >
              {char}
            </span>
          ))}
        </span>
        <span className="app-splash__rule" />
      </div>
    </div>
  );
}
