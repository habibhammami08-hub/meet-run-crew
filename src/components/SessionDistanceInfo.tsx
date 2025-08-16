import { useEffect, useState } from 'react';
import { MapPin, Clock } from 'lucide-react';
import { useDistanceMatrix } from '@/hooks/useDistanceMatrix';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Badge } from '@/components/ui/badge';

interface SessionDistanceInfoProps {
  sessionLocation: string;
  className?: string;
}

interface DistanceInfo {
  distance: string;
  duration: string;
}

export function SessionDistanceInfo({ sessionLocation, className }: SessionDistanceInfoProps) {
  const [distanceInfo, setDistanceInfo] = useState<DistanceInfo | null>(null);
  const { calculateDistances, loading } = useDistanceMatrix();
  const { position } = useGeolocation();

  useEffect(() => {
    if (!position || !sessionLocation) return;

    const userLocation = `${position.latitude},${position.longitude}`;
    
    calculateDistances([userLocation], [sessionLocation])
      .then(result => {
        if (result && result.rows[0]?.elements[0]) {
          const element = result.rows[0].elements[0];
          if (element.distance && element.duration) {
            setDistanceInfo({
              distance: element.distance.text,
              duration: element.duration.text
            });
          }
        }
      });
  }, [position, sessionLocation, calculateDistances]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <MapPin className="h-4 w-4" />
        <span>Calcul en cours...</span>
      </div>
    );
  }

  if (!distanceInfo || !position) {
    return null;
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Badge variant="secondary" className="flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        {distanceInfo.distance}
      </Badge>
      <Badge variant="outline" className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {distanceInfo.duration}
      </Badge>
    </div>
  );
}