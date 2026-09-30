import { useEffect, useState } from "react";
import { Calendar, Clock, Loader2, MapPin, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type LeaveSessionTarget = {
  id: string;
  title: string;
  scheduled_at: string;
  place?: string | null;
  /** "unenroll" = le participant se retire · "delete" = l'hôte supprime sa session vide */
  mode: "unenroll" | "delete";
};

type Props = {
  target: LeaveSessionTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (target: LeaveSessionTarget) => Promise<void>;
};

function countdownLabel(iso: string) {
  const minutes = (new Date(iso).getTime() - Date.now()) / 60000;
  if (minutes <= 0) return "En cours";
  if (minutes < 60) return `Dans ${Math.round(minutes)} min`;
  if (minutes < 24 * 60) return `Dans ${Math.round(minutes / 60)} h`;
  return `Dans ${Math.round(minutes / (60 * 24))} j`;
}

export default function LeaveSessionDialog({ target, onOpenChange, onConfirm }: Props) {
  // On garde la dernière cible en mémoire pour que la feuille reste lisible pendant l'animation de fermeture.
  const [cached, setCached] = useState(target);
  if (target && target.id !== cached?.id) setCached(target);
  useEffect(() => {
    if (target) setCached(target);
  }, [target]);

  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) setBusy(false);
  }, [target]);

  const data = cached;
  const isDelete = data?.mode === "delete";

  async function handleConfirm() {
    if (!data) return;
    setBusy(true);
    try {
      await onConfirm(data);
      toast.success(isDelete ? "Session supprimée" : "Vous êtes désinscrit·e de cette session");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Une erreur est survenue, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const scheduled = data ? new Date(data.scheduled_at) : null;
  const isFuture = scheduled ? scheduled.getTime() > Date.now() : false;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        overlayClassName="z-[10000] bg-black/45 backdrop-blur-[2px]"
        className="fixed inset-x-0 bottom-0 left-0 top-auto z-[10001] flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-3xl border-x-0 border-b-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(88vh,780px)] sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:pb-0 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-top-[48%]"
      >
        <span aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden" />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                isDelete ? "bg-red-50 text-red-600 ring-1 ring-red-100" : "bg-red-50 text-red-600 ring-1 ring-red-100"
              )}
            >
              {isDelete ? <Trash2 className="h-5 w-5" /> : <UserMinus className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold leading-snug tracking-tight">
                {isDelete ? "Supprimer cette session ?" : "Se désinscrire de cette session ?"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {isDelete
                  ? "Vous êtes l’hôte et personne d’autre n’y participe. La session sera définitivement supprimée."
                  : "Vous libérez votre place et pourrez vous réinscrire tant qu’il en reste."}
              </DialogDescription>
            </div>
          </div>

          {data && (
            <div className="mt-4 rounded-2xl bg-muted/60 p-4 ring-1 ring-foreground/5">
              <p className="truncate text-sm font-bold text-foreground">{data.title}</p>
              {scheduled && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                    <Calendar className="h-3 w-3" />
                    {scheduled.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {" · "}
                    {scheduled.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isFuture && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      <Clock className="h-3 w-3" />
                      {countdownLabel(data.scheduled_at)}
                    </span>
                  )}
                </div>
              )}
              {data.place && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{data.place}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border/70 px-5 py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-bold text-white",
                "transition-all hover:bg-red-700 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-60"
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isDelete ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <UserMinus className="h-4 w-4" />
              )}
              {busy ? "Un instant…" : isDelete ? "Supprimer la session" : "Se désinscrire"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full bg-muted px-4 text-sm font-semibold text-foreground",
                "transition-all hover:bg-muted/70 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-60"
              )}
            >
              {isDelete ? "Conserver la session" : "Rester inscrit·e"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
