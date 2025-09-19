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
  const [suggestions, setSuggestions] = React.useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = React.useState(false)

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

  // Rechercher des suggestions d'adresses
  const searchSuggestions = async (input: string) => {
    if (!input.trim() || input.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    
    setIsLoadingSuggestions(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-maps-services', {
        body: {
          action: 'autocomplete',
          input: input
        }
      })

      if (error) throw error

      if (data?.predictions) {
        setSuggestions(data.predictions)
        setShowSuggestions(true)
      }
    } catch (error) {
      console.error('Erreur de recherche de suggestions:', error)
      setSuggestions([])
      setShowSuggestions(false)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  // Gérer la saisie d'adresse
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value
    setAddress(newAddress)
  }

  // Rechercher des suggestions avec debounce
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (address.trim()) {
        searchSuggestions(address)
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [address])

  // Sélectionner une suggestion
  const selectSuggestion = (suggestion: any) => {
    setAddress(suggestion.description)
    setShowSuggestions(false)
    geocodeAddress(suggestion.description)
  }

  // Gérer la validation au blur (perte de focus)
  const handleBlur = () => {
    // Délai pour permettre le clic sur une suggestion
    setTimeout(() => {
      setShowSuggestions(false)
      if (address.trim()) {
        geocodeAddress(address)
      }
    }, 150)
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
    <div className={cn("flex items-center space-x-2 relative", className)}>
      <div className={cn("flex-shrink-0 p-2 rounded-full bg-background border-2", 
        icon === "start" ? "border-green-600" : "border-red-600"
      )}>
        <IconComponent className={cn("h-4 w-4", iconColor)} />
      </div>
      <div className="flex-1 relative">
        <Input
          value={displayValue}
          onChange={handleAddressChange}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="h-12 text-base"
          disabled={isGeocoding}
        />
        
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.place_id || index}
                className="w-full px-4 py-3 text-left hover:bg-muted/50 border-b border-border last:border-b-0 text-sm"
                onClick={() => selectSuggestion(suggestion)}
              >
                <div className="font-medium">{suggestion.structured_formatting?.main_text}</div>
                <div className="text-muted-foreground text-xs">{suggestion.structured_formatting?.secondary_text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {(isGeocoding || isLoadingSuggestions) && (
        <div className="flex-shrink-0">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}