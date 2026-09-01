// src/features/vendor-map/components/Map.tsx
//
// GLPDX-22 — minimal, reusable map component. Pure library scaffolding:
// renders a blank MapLibre map with no tile provider and no
// Portland-specific positioning. Real Stadia tiles come in GLPDX-23; the
// production Portland-metro map UI (GLPDX-21) composes THIS component
// rather than reimplementing map instantiation — it just passes different
// `options` (a Stadia style URL, Portland center/zoom).

import type maplibregl from 'maplibre-gl';
import { useMapLibre } from '../hooks/useMapLibre';

export interface MapProps {
  className?: string;
  options?: Partial<maplibregl.MapOptions>;
  onLoad?: (map: maplibregl.Map) => void;
}

export function Map({ className, options, onLoad }: MapProps) {
  const { containerRef } = useMapLibre({ options, onLoad });

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="map-container"
    />
  );
}