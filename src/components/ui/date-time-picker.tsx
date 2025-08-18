import * as React from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DateTimePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DateTimePicker({ value, onChange, placeholder = "Choisir date et heure", className }: DateTimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? new Date(value) : undefined
  )
  const [time, setTime] = React.useState<string>(
    value ? format(new Date(value), "HH:mm") : ""
  )

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate)
      updateDateTime(selectedDate, time)
    }
  }

  const handleTimeChange = (timeValue: string) => {
    setTime(timeValue)
    if (date) {
      updateDateTime(date, timeValue)
    }
  }

  const updateDateTime = (selectedDate: Date, timeValue: string) => {
    if (timeValue && selectedDate) {
      const [hours, minutes] = timeValue.split(':').map(Number)
      const newDateTime = new Date(selectedDate)
      newDateTime.setHours(hours, minutes, 0, 0)
      onChange(format(newDateTime, "yyyy-MM-dd'T'HH:mm"))
    }
  }

  const displayValue = date && time 
    ? `${format(date, "EEEE d MMMM", { locale: fr })} à ${time}`
    : placeholder

  return (
    <div className={cn("space-y-3", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-12 px-4",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
            <span className="text-base">{displayValue}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            initialFocus
            className="p-3 pointer-events-auto"
          />
          {date && (
            <div className="p-3 border-t">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-primary" />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}