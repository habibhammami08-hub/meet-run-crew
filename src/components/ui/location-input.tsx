import * as React from "react"
import { MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface LocationInputProps {
  value?: { lat: number; lng: number } | null
  onChange: (location: { lat: number; lng: number } | null) => void
  placeholder: string
  icon: "start" | "end"
  onMapSelect: () => void
  className?: string
}

export function LocationInput({ 
  value, 
  onChange, 
  placeholder, 
  icon, 
  onMapSelect, 
  className 
}: LocationInputProps) {
  const [address, setAddress] = React.useState("")

  const iconColor = icon === "start" ? "text-green-600" : "text-red-600"
  const IconComponent = icon === "start" ? Navigation : MapPin

  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          onChange(location)
          setAddress("Position actuelle")
        },
        (error) => {
          console.error("Erreur de géolocalisation:", error)
        }
      )
    }
  }

  const displayValue = value 
    ? address || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
    : ""

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center space-x-2">
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
      
      <div className="flex space-x-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMapSelect}
          className="flex-1"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Sélectionner sur la carte
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCurrentLocation}
          className="flex-1"
        >
          <Navigation className="h-4 w-4 mr-2" />
          Ma position
        </Button>
      </div>
    </div>
  )
}