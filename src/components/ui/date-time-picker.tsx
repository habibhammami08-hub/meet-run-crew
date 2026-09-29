import * as React from "react"
import { format, startOfDay } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface DateTimePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const timeGroups = [
  { label: "Nuit", start: 0, end: 6 },
  { label: "Matin", start: 6, end: 12 },
  { label: "Après-midi", start: 12, end: 18 },
  { label: "Soir", start: 18, end: 24 },
]

function parseLocalDate(value?: string) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function DateTimePicker({ value, onChange, placeholder = "Choisir date et heure", className }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedDay, setSelectedDay] = React.useState<Date>(() => parseLocalDate(value) ?? new Date())
  const [now, setNow] = React.useState(() => new Date())
  const selectedValue = parseLocalDate(value)
  const timeListRef = React.useRef<HTMLDivElement>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedDay(selectedValue ?? new Date())
      setNow(new Date())
    }
    setOpen(nextOpen)
  }

  const selectDay = (day: Date | undefined) => {
    if (!day) return
    setSelectedDay(day)
    requestAnimationFrame(() => timeListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }))
  }

  const selectTime = (hours: number, minutes: number) => {
    const scheduled = new Date(selectedDay)
    scheduled.setHours(hours, minutes, 0, 0)
    if (scheduled.getTime() < now.getTime() + 45 * 60 * 1000) return
    onChange(format(scheduled, "yyyy-MM-dd'T'HH:mm"))
    setOpen(false)
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(true)}
        className={cn("h-12 w-full justify-start gap-3 px-4 text-left font-normal", !selectedValue && "text-muted-foreground")}
      >
        <CalendarIcon className="h-5 w-5 shrink-0 text-foreground" />
        <span className="min-w-0 truncate text-base">
          {selectedValue ? format(selectedValue, "EEEE d MMMM 'à' HH:mm", { locale: fr }) : placeholder}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-lg border-x-0 border-b-0 p-0 pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(88vh,780px)] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:pb-0 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-top-[48%]">
          <DialogHeader className="shrink-0 border-b px-5 pb-3 pt-5 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg"><CalendarIcon className="h-5 w-5" /> Date et heure</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
            <div className="flex justify-center border-b py-2">
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={selectDay}
                disabled={(day) => day < startOfDay(now)}
                locale={fr}
                weekStartsOn={1}
                initialFocus
                className="pointer-events-auto p-2"
              />
            </div>
            <div ref={timeListRef} className="pt-5">
              <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
                <Clock3 className="h-4 w-4" /> {format(selectedDay, "EEEE d MMMM", { locale: fr })}
              </div>
              {timeGroups.map(({ label, start, end }) => {
                const slots = Array.from({ length: (end - start) * 4 }, (_, index) => {
                  const hours = start + Math.floor(index / 4)
                  const minutes = (index % 4) * 15
                  const scheduled = new Date(selectedDay)
                  scheduled.setHours(hours, minutes, 0, 0)
                  return { hours, minutes, scheduled }
                })
                if (slots.every(({ scheduled }) => scheduled.getTime() < now.getTime() + 45 * 60 * 1000)) return null
                return (
                  <div key={label} className="mb-5">
                    <p className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map(({ hours, minutes, scheduled }) => {
                        const unavailable = scheduled.getTime() < now.getTime() + 45 * 60 * 1000
                        const time = format(scheduled, "HH:mm")
                        const isSelected = selectedValue?.getTime() === scheduled.getTime()
                        return (
                          <Button
                            key={time}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            disabled={unavailable}
                            onClick={() => selectTime(hours, minutes)}
                            className="h-11 min-w-0 px-1 text-sm font-medium"
                            aria-label={`${time}${unavailable ? " indisponible" : ""}`}
                          >
                            {time}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
