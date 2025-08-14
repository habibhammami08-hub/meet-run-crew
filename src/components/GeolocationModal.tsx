import React from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin } from "lucide-react";

interface GeolocationModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onLater: () => void;
}

const GeolocationModal = ({ isOpen, onAllow, onLater }: GeolocationModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onLater()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sport-black">
            <MapPin className="w-5 h-5 text-sport-green" />
            Activer votre position
          </DialogTitle>
          <DialogDescription className="text-sport-gray">
            Pour afficher les sessions de running autour de vous et estimer les distances, 
            autorisez l'accès à votre position.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-3 sm:justify-start">
          <Button 
            variant="sport" 
            onClick={onAllow}
            className="flex-1 sm:flex-none"
          >
            Autoriser ma position
          </Button>
          <Button 
            variant="sportOutline" 
            onClick={onLater}
            className="flex-1 sm:flex-none"
          >
            Plus tard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GeolocationModal;