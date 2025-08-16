import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DistanceMatrixElement {
  distance?: {
    text: string;
    value: number;
  };
  duration?: {
    text: string;
    value: number;
  };
  status: string;
}

interface DistanceMatrixResponse {
  status: string;
  rows: {
    elements: DistanceMatrixElement[];
  }[];
  origin_addresses: string[];
  destination_addresses: string[];
}

interface UseDistanceMatrixProps {
  mode?: 'walking' | 'driving' | 'bicycling' | 'transit';
  units?: 'metric' | 'imperial';
}

export function useDistanceMatrix({ 
  mode = 'walking', 
  units = 'metric' 
}: UseDistanceMatrixProps = {}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DistanceMatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const calculateDistances = async (
    origins: string[],
    destinations: string[]
  ) => {
    if (!origins.length || !destinations.length) {
      setError('Origins et destinations requis');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: result, error: functionError } = await supabase.functions.invoke(
        'google-maps-services',
        {
          body: {
            action: 'distance_matrix',
            origins,
            destinations,
            mode,
            units
          }
        }
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (result.status !== 'OK') {
        throw new Error(`Erreur API: ${result.status}`);
      }

      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du calcul des distances';
      setError(errorMessage);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getClosestSessions = (
    userLocation: string,
    sessionLocations: Array<{ id: string; location: string; [key: string]: any }>
  ) => {
    if (!userLocation || !sessionLocations.length) return [];

    return calculateDistances(
      [userLocation],
      sessionLocations.map(s => s.location)
    ).then(result => {
      if (!result || !result.rows[0]) return sessionLocations;

      return sessionLocations
        .map((session, index) => ({
          ...session,
          distance: result.rows[0].elements[index]?.distance || null,
          duration: result.rows[0].elements[index]?.duration || null
        }))
        .sort((a, b) => {
          if (!a.distance || !b.distance) return 0;
          return a.distance.value - b.distance.value;
        });
    });
  };

  return {
    calculateDistances,
    getClosestSessions,
    loading,
    data,
    error,
  };
}