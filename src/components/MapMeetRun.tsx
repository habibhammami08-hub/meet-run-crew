import React from 'react';
import MapboxMap from '@/components/MapboxMap';

interface MapMeetRunProps {
  runs?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  onRunSelect?: (runId: string) => void;
  center?: [number, number];
}

const MapMeetRun = ({ runs = [], onRunSelect, center }: MapMeetRunProps) => {
  return (
    <div className="w-full" style={{ height: '60vh', minHeight: '60vh' }}>
      <MapboxMap 
        runs={runs}
        onRunSelect={onRunSelect}
        center={center}
      />
    </div>
  );
};

export default MapMeetRun;