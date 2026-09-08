"use client";

import { Globe3D, type GlobeMarker } from "@/components/ui/3d-globe";

const sampleMarkers: GlobeMarker[] = [
  { lat: 30.0444, lng: 31.2357, label: "Cairo", caption: "Home base", home: true },
  { lat: 25.2048, lng: 55.2708, label: "Dubai" },
  { lat: 24.7136, lng: 46.6753, label: "Riyadh" },
  { lat: 51.5074, lng: -0.1278, label: "London" },
  { lat: 48.8566, lng: 2.3522, label: "Paris" },
  { lat: 52.52, lng: 13.405, label: "Berlin" },
  { lat: 40.7128, lng: -74.006, label: "New York" },
  { lat: 43.6532, lng: -79.3832, label: "Toronto" },
  { lat: 1.3521, lng: 103.8198, label: "Singapore" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo" },
  { lat: -33.8688, lng: 151.2093, label: "Sydney" },
];

/** Reference usage of the globe — the same API as the design-system snippet. */
export function Globe3DDemo() {
  return (
    <div className="mx-auto aspect-square w-full max-w-[620px]">
      <Globe3D
        markers={sampleMarkers}
        config={{
          atmosphereColor: "#4da6ff",
          atmosphereIntensity: 20,
          bumpScale: 5,
          autoRotateSpeed: 0.3,
        }}
        onMarkerClick={(marker) => {
          console.log("Clicked marker:", marker.label);
        }}
        onMarkerHover={(marker) => {
          if (marker) console.log("Hovering:", marker.label);
        }}
      />
    </div>
  );
}

export default Globe3DDemo;
