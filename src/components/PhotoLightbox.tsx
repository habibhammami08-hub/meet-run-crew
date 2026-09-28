// src/components/PhotoLightbox.tsx
// Affiche une photo de profil en grand (plein écran, fond sombre flouté).
// Se ferme au toucher ailleurs, sur la croix ou avec la touche Échap.

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  src: string | null;
  name?: string | null;
  caption?: string | null;
  onClose: () => void;
};

const PhotoLightbox = ({ open, src, name, caption, onClose }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  const size = "min(82vw, 58dvh, 440px)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name ? `Photo de ${name}` : "Photo de profil"}
      onClick={onClose}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-5 bg-[#0b0c0b]/95 px-6 py-16 backdrop-blur-md motion-safe:animate-fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-full bg-gradient-to-tr from-emerald-400 via-sky-500 to-rose-500 p-[4px] shadow-2xl motion-safe:animate-scale-in"
          style={{ width: size, height: size }}
        >
          <img
            src={src}
            alt={name ? `Photo de ${name}` : "Photo de profil"}
            onClick={onClose}
            className="h-full w-full rounded-full border-[6px] border-[#0b0c0b] object-cover"
          />
        </div>

        {name && (
          <p className="mt-5 text-center text-xl font-extrabold tracking-tight text-white motion-safe:animate-fade-in">
            {name}
          </p>
        )}
        {caption && (
          <p className="mt-1 text-center text-sm text-white/60 motion-safe:animate-fade-in">
            {caption}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-white/35">Touchez ailleurs pour fermer</p>
    </div>
  );
};

export default PhotoLightbox;
