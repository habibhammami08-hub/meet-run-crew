import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MapPin, Navigation, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationPickerProps {
  onLocationSelect: (lat: number, lng: number, type: 'start' | 'end') => void;
  selectedStart?: { lat: number; lng: number };
  selectedEnd?: { lat: number; lng: number };
  onClose: () => void;
}

const LocationPicker = ({ onLocationSelect, selectedStart, selectedEnd, onClose }: LocationPickerProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const [mode, setMode] = useState<'start' | 'end'>('start');

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Initialize map
    const map = L.map(mapContainer.current).setView([-41.28664, 174.77557], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapRef.current = map;

    // Handle map clicks
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      onLocationSelect(lat, lng, mode);
      
      if (mode === 'start') {
        // Remove existing start marker
        if (startMarkerRef.current) {
          map.removeLayer(startMarkerRef.current);
        }
        
        // Add new start marker (green)
        const startIcon = L.divIcon({
          html: '<div style="background-color: #22c55e; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: 'custom-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        startMarkerRef.current = L.marker([lat, lng], { icon: startIcon }).addTo(map);
      } else {
        // Remove existing end marker
        if (endMarkerRef.current) {
          map.removeLayer(endMarkerRef.current);
        }
        
        // Add new end marker (red)
        const endIcon = L.divIcon({
          html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: 'custom-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        endMarkerRef.current = L.marker([lat, lng], { icon: endIcon }).addTo(map);
      }
    });

    // Try to get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.setView([latitude, longitude], 15);
        },
        (error) => {
          console.log('Geolocation error:', error);
        }
      );
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when props change
  useEffect(() => {
    if (!mapRef.current) return;

    // Update start marker
    if (selectedStart) {
      if (startMarkerRef.current) {
        mapRef.current.removeLayer(startMarkerRef.current);
      }
      
      const startIcon = L.divIcon({
        html: '<div style="background-color: #22c55e; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
        className: 'custom-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      
      startMarkerRef.current = L.marker([selectedStart.lat, selectedStart.lng], { icon: startIcon }).addTo(mapRef.current);
    }

    // Update end marker
    if (selectedEnd) {
      if (endMarkerRef.current) {
        mapRef.current.removeLayer(endMarkerRef.current);
      }
      
      const endIcon = L.divIcon({
        html: '<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
        className: 'custom-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      
      endMarkerRef.current = L.marker([selectedEnd.lat, selectedEnd.lng], { icon: endIcon }).addTo(mapRef.current);
    }
  }, [selectedStart, selectedEnd]);

  const handleUseMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          onLocationSelect(latitude, longitude, mode);
          
          if (mapRef.current) {
            mapRef.current.setView([latitude, longitude], 15);
          }
        },
        (error) => {
          console.error('Erreur de géolocalisation:', error);
        }
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin size={20} />
            Sélectionner les points de course
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={20} />
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="flex gap-2">
              <Button
                variant={mode === 'start' ? 'sport' : 'outline'}
                size="sm"
                onClick={() => setMode('start')}
                className="flex items-center gap-2"
              >
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                Point de départ {selectedStart && '✓'}
              </Button>
              <Button
                variant={mode === 'end' ? 'sport' : 'outline'}
                size="sm"
                onClick={() => setMode('end')}
                className="flex items-center gap-2"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                Point d'arrivée {selectedEnd && '✓'}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUseMyLocation}
                className="flex items-center gap-2"
              >
                <Navigation size={16} />
                Utiliser ma position
              </Button>
            </div>

            <Label className="text-sm text-muted-foreground">
              Cliquez sur la carte pour placer le {mode === 'start' ? 'point de départ' : 'point d\'arrivée'} 
              {mode === 'start' ? ' (obligatoire)' : ' (optionnel)'}
            </Label>

            {/* Map container */}
            <div 
              ref={mapContainer} 
              className="w-full h-96 border rounded-lg"
              style={{ minHeight: '400px' }}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button 
                variant="sport" 
                onClick={onClose}
                disabled={!selectedStart}
              >
                Confirmer la sélection
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationPicker;