import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MapboxMapProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  runs?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  onRunSelect?: (runId: string) => void;
}

const MapboxMap = ({ onLocationSelect, runs = [], onRunSelect }: MapboxMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const MAPBOX_TOKEN = 'pk.eyJ1IjoiaGFiaWJoYW1tIiwiYSI6ImNtZWFxNjVuZTExbGsyeHM4bnYxNXEya2cifQ.vZPUHGgq9_OkWBmetI1ZwQ';

  const initializeMap = () => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [174.7762, -41.2865], // Wellington, NZ
      zoom: 12,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add click handler for location selection
    if (onLocationSelect) {
      map.current.on('click', async (e) => {
        const { lng, lat } = e.lngLat;
        
        // Reverse geocoding to get address
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}`
          );
          const data = await response.json();
          const address = data.features[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          
          onLocationSelect(lat, lng, address);
        } catch (error) {
          console.error('Geocoding error:', error);
          onLocationSelect(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      });
    }

    // Add run markers
    runs.forEach((run) => {
      const marker = new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat([run.longitude, run.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <h3 class="font-semibold">${run.title}</h3>
              <button class="mt-2 px-3 py-1 bg-green-500 text-white rounded text-sm" onclick="window.selectRun('${run.id}')">
                Voir détails
              </button>
            </div>`
          )
        )
        .addTo(map.current!);
    });

    // Global function for run selection
    (window as any).selectRun = (runId: string) => {
      onRunSelect?.(runId);
    };
  };

  useEffect(() => {
    initializeMap();

    return () => {
      map.current?.remove();
    };
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
};

export default MapboxMap;