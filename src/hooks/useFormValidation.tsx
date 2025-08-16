import { useCallback } from 'react';
import { SECURITY_RULES } from '@/lib/auth/security';
import type { Session } from '@/types/database';

interface FormValidationErrors {
  [key: string]: string;
}

interface SessionFormData {
  title: string;
  date: string;
  time: string;
  area_hint: string;
  distance_km: string;
  intensity: string;
  type: string;
  max_participants: string;
  description?: string;
  selectedLocations: {
    start?: { lat: number; lng: number };
    end?: { lat: number; lng: number };
  };
}

export const useFormValidation = () => {
  const validateSessionForm = useCallback((formData: SessionFormData): FormValidationErrors => {
    const errors: FormValidationErrors = {};

    // Use centralized security validation
    const sessionData: Partial<Session> = {
      title: formData.title,
      scheduled_at: formData.date && formData.time ? `${formData.date}T${formData.time}` : '',
      start_lat: formData.selectedLocations.start?.lat,
      start_lng: formData.selectedLocations.start?.lng,
      distance_km: parseFloat(formData.distance_km) || 0,
      max_participants: parseInt(formData.max_participants) || 0,
      min_participants: 2,
      intensity: formData.intensity as any,
      session_type: formData.type as any,
      price_cents: 450,
      duration_minutes: 60,
    };

    const { isValid, errors: securityErrors } = SECURITY_RULES.validateSessionCreation(sessionData, null);
    
    if (!isValid) {
      securityErrors.forEach((error, index) => {
        errors[`field_${index}`] = error;
      });
    }

    // Additional form-specific validations
    if (!formData.area_hint?.trim()) {
      errors.area_hint = "La description du lieu est obligatoire";
    }

    if (!formData.selectedLocations.start) {
      errors.start_location = "Le point de départ est obligatoire";
    }

    if (!formData.selectedLocations.end) {
      errors.end_location = "Le point d'arrivée est obligatoire";
    }

    // Coordinate validation
    if (formData.selectedLocations.start) {
      const { lat, lng } = formData.selectedLocations.start;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || 
          Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        errors.start_coords = "Coordonnées de départ invalides";
      }
    }

    if (formData.selectedLocations.end) {
      const { lat, lng } = formData.selectedLocations.end;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || 
          Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        errors.end_coords = "Coordonnées d'arrivée invalides";
      }
    }

    return errors;
  }, []);

  const validateProfileForm = useCallback((profileData: any): FormValidationErrors => {
    const errors: FormValidationErrors = {};
    
    const { isValid, errors: securityErrors } = SECURITY_RULES.validateProfileUpdate(profileData);
    
    if (!isValid) {
      securityErrors.forEach((error, index) => {
        errors[`field_${index}`] = error;
      });
    }

    return errors;
  }, []);

  const getFirstError = useCallback((errors: FormValidationErrors): string | null => {
    const errorKeys = Object.keys(errors);
    return errorKeys.length > 0 ? errors[errorKeys[0]] : null;
  }, []);

  const hasErrors = useCallback((errors: FormValidationErrors): boolean => {
    return Object.keys(errors).length > 0;
  }, []);

  return {
    validateSessionForm,
    validateProfileForm,
    getFirstError,
    hasErrors,
  };
};