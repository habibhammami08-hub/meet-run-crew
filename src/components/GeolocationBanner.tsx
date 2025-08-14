import React from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, X } from "lucide-react";

interface GeolocationBannerProps {
  isVisible: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

const GeolocationBanner = ({ isVisible, onRetry, onDismiss }: GeolocationBannerProps) => {
  if (!isVisible) return null;

  return (
    <div className="absolute top-4 left-4 right-4 z-50">
      <Alert className="bg-sport-gray-light border-sport-green shadow-card">
        <MapPin className="h-4 w-4 text-sport-green" />
        <AlertDescription className="text-sport-black">
          <div className="flex justify-between items-center">
            <span className="text-sm">
              La géolocalisation est désactivée. Vous pouvez l'activer dans les réglages de votre navigateur. 
              En attendant, nous affichons Wellington.
            </span>
            <div className="flex gap-2 ml-4">
              <Button 
                variant="sportOutline" 
                size="sm" 
                onClick={onRetry}
                className="text-xs"
              >
                Réessayer
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onDismiss}
                className="p-1 h-auto text-sport-gray hover:text-sport-black"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default GeolocationBanner;