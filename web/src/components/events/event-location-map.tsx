'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Leaflet's default marker icon resolves its PNG paths relative to the
// stylesheet URL, which 404s under Next's asset pipeline. Re-point at the
// bundler-resolved URLs once, at module load — a Leaflet library asset fix,
// not a violation of the Iconify-only rule (docs/DESIGN_SYSTEM.md), which
// governs interface icons, not third-party map-marker graphics.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

const DAKAR_CENTER: [number, number] = [14.6928, -17.4467];
const DEFAULT_ZOOM = 12;
const SELECTED_ZOOM = 15;

interface EventLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onMapClick: (lat: number, lng: number) => void;
  disabled?: boolean;
}

function ClickHandler({ onClick, disabled }: { onClick: (lat: number, lng: number) => void; disabled?: boolean }) {
  useMapEvents({
    click(e) {
      if (!disabled) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// react-leaflet v4's MapContainer only reads center/zoom on initial mount
// (uncontrolled thereafter) — without this, selecting a search result would
// move the marker but not recenter the visible map.
function RecenterOnChange({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (latitude != null && longitude != null) {
      map.setView([latitude, longitude], SELECTED_ZOOM);
    }
  }, [latitude, longitude, map]);
  return null;
}

export default function EventLocationMap({ latitude, longitude, onMapClick, disabled }: EventLocationMapProps) {
  const hasPosition = latitude != null && longitude != null;
  const center: [number, number] = hasPosition ? [latitude, longitude] : DAKAR_CENTER;

  return (
    <div className="h-[320px] overflow-hidden rounded border-[1.5px] border-border">
      <MapContainer center={center} zoom={hasPosition ? SELECTED_ZOOM : DEFAULT_ZOOM} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPosition && <Marker position={[latitude, longitude]} />}
        <ClickHandler onClick={onMapClick} disabled={disabled} />
        <RecenterOnChange latitude={latitude} longitude={longitude} />
      </MapContainer>
    </div>
  );
}
