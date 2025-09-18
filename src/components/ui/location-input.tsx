import * as React from "react"
import { MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface LocationInputProps {
  value?: { lat: number; lng: number } | null
  onChange: (location: { lat: number; lng: number } | null) => void
  placeholder: string
  icon: "start" | "end"
  className?: string
}

export function LocationInput({ 
  value, 
  onChange, 
  placeholder, 
  icon, 
  className 
}: LocationInputProps) {
  const [address, setAddress] = React.useState("")

  const iconColor = icon === "start" ? "text-green-600" : "text-red-600"
  const IconComponent = icon === "start" ? Navigation : MapPin

  const displayValue = value 
    ? address || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
    : ""

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className={cn("flex-shrink-0 p-2 rounded-full bg-background border-2", 
        icon === "start" ? "border-green-600" : "border-red-600"
      )}>
        <IconComponent className={cn("h-4 w-4", iconColor)} />
      </div>
      <Input
        value={displayValue}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={placeholder}
        className="flex-1 h-12 text-base"
      />
    </div>
  )
}