import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, ImagePlus, Loader2, Trash2, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Conversion impossible"))), "image/jpeg", 0.9)
  );
}

interface Props {
  userId: string;
  avatarUrl?: string | null;
  name?: string | null;
  onChange: (url: string | null) => void;
  size?: number;
}

export default function AvatarEditor({ userId, avatarUrl, name, onChange, size = 112 }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const initials = (name || "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const pick = () => inputRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Format non supporté", description: "Choisissez une image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Image trop lourde", description: "10 Mo maximum.", variant: "destructive" });
      return;
    }
    setMenuOpen(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSrc(URL.createObjectURL(file));
  };

  const onCropComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const closeCrop = () => {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
  };

  const save = async () => {
    if (!src || !area) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(src, area);
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      onChange(url);
      closeCrop();
      toast({ title: "Photo mise à jour", description: "Votre nouvelle photo est en ligne." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message ?? "Envoi impossible", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    setBusy(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    onChange(null);
    setMenuOpen(false);
    toast({ title: "Photo supprimée" });
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      <button
        type="button"
        onClick={() => (avatarUrl ? setMenuOpen(true) : pick())}
        className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ width: size, height: size }}
        aria-label="Modifier la photo de profil"
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full p-[3px] transition-transform duration-300 group-hover:scale-105",
            avatarUrl
              ? "bg-gradient-to-tr from-primary via-promo to-pink-500"
              : "border-2 border-dashed border-muted-foreground/40"
          )}
        >
          <span className="block h-full w-full rounded-full bg-background p-[3px]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Photo de profil" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
                {initials || <UserIcon className="h-1/2 w-1/2" />}
              </span>
            )}
          </span>
        </span>
        <span className="absolute inset-[6px] flex items-center justify-center rounded-full bg-foreground/0 opacity-0 transition-all group-hover:bg-foreground/40 group-hover:opacity-100">
          <Camera className="h-6 w-6 text-background" />
        </span>
        <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
      </button>

      {/* Action sheet */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="items-center border-b p-6">
            {avatarUrl && <img src={avatarUrl} alt="" className="mb-3 h-20 w-20 rounded-full object-cover" />}
            <DialogTitle>Photo de profil</DialogTitle>
          </DialogHeader>
          <button onClick={pick} className="flex items-center justify-center gap-2 border-b p-4 font-semibold text-primary hover:bg-muted">
            <ImagePlus className="h-4 w-4" /> Choisir une nouvelle photo
          </button>
          <button onClick={remove} disabled={busy} className="flex items-center justify-center gap-2 border-b p-4 font-semibold text-destructive hover:bg-muted">
            <Trash2 className="h-4 w-4" /> Supprimer la photo
          </button>
          <button onClick={() => setMenuOpen(false)} className="p-4 hover:bg-muted">Annuler</button>
        </DialogContent>
      </Dialog>

      {/* Crop */}
      <Dialog open={!!src} onOpenChange={(o) => !o && !busy && closeCrop()}>
        <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-w-md sm:rounded-lg">
          <DialogHeader className="shrink-0 p-4">
            <DialogTitle className="text-center">Recadrer</DialogTitle>
          </DialogHeader>
          <div className="relative min-h-0 w-full flex-1 bg-foreground sm:aspect-square sm:flex-none">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="shrink-0 space-y-3 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">−</span>
              <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={(v) => setZoom(v[0])} aria-label="Zoom" />
              <span className="text-xs text-muted-foreground">+</span>
            </div>
            <p className="hidden text-center text-xs text-muted-foreground sm:block">Glissez pour placer, pincez ou utilisez le curseur pour zoomer.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={closeCrop} disabled={busy}>Annuler</Button>
              <Button className="h-12 flex-1 text-base" onClick={save} disabled={busy || !area}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
