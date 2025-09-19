import * as React from "react"
import { MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { supabase } from "@/integrations/supabase/client"

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
  const [isGeocoding, setIsGeocoding] = React.useState(false)

  const iconColor = icon === "start" ? "text-green-600" : "text-red-600"
  const IconComponent = icon === "start" ? Navigation : MapPin

  // Géocodage d'adresse vers coordonnées
  const geocodeAddress = async (addressText: string) => {
    if (!addressText.trim() || !supabase) return
    
    setIsGeocoding(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-maps-services', {
        body: {
          action: 'geocode',
          address: addressText
        }
      })

      if (error) throw error

      if (data?.results && data.results.length > 0) {
        const location = data.results[0].geometry.location
        onChange({
          lat: location.lat,
          lng: location.lng
        })
      }
    } catch (error) {
      console.error('Erreur de géocodage:', error)
    } finally {
      setIsGeocoding(false)
    }
  }

  // Gérer la saisie d'adresse
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value
    setAddress(newAddress)
  }

  // Gérer la validation au blur (perte de focus)
  const handleBlur = () => {
    if (address.trim()) {
      geocodeAddress(address)
    }
  }

  // Gérer l'appui sur Entrée
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && address.trim()) {
      geocodeAddress(address)
    }
  }

  const displayValue = React.useMemo(() => {
    if (address) return address
    if (value) return `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
    return ""
  }, [address, value])

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className={cn("flex-shrink-0 p-2 rounded-full bg-background border-2", 
        icon === "start" ? "border-green-600" : "border-red-600"
      )}>
        <IconComponent className={cn("h-4 w-4", iconColor)} />
      </div>
      <Input
        value={displayValue}
        onChange={handleAddressChange}
        onBlur={handleBlur}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        className="flex-1 h-12 text-base"
        disabled={isGeocoding}
      />
      {isGeocoding && (
        <div className="flex-shrink-0">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}