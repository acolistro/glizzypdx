// src/features/vendor-map/hooks/useMapLibre.ts
//
// GLPDX-22 — custom hook that owns the lifecycle of a maplibre-gl Map
// instance. This is the "logic" half of the Map component (see
// ../components/Map.tsx, which is the thin rendering wrapper around this
// hook) — separating them follows this project's convention of extracting
// component logic into custom hooks rather than keeping it inline in
// components.
//
// Where its data comes from: a `containerRef` this hook creates and hands
// back to the caller — the caller must attach it to a DOM element (a
// <div>) for the map to mount into. Also accepts optional `options`
// (caller overrides for maplibre-gl's MapOptions, e.g. style/center/zoom)
// and an optional `onLoad` callback.
//
// Where its output goes: the returned `containerRef` gets attached to a
// DOM element by the caller (see Map.tsx). The `map` value is exposed so
// callers can react once the map instance exists — e.g. GLPDX-33 will use
// this (via Map's onLoad callback) to add vendor pin markers once the map
// is ready.
//
// Non-obvious pattern: the map is created exactly ONCE, in an effect that
// intentionally runs only on mount (empty dependency array). Re-running
// map creation whenever `options` changes would destroy and recreate the
// whole map (expensive, and would flash/reset the view) every time a
// caller passed a new object literal as `options`. Consumers who need to
// change the map after creation (fly to a new center, add a source, etc.)
// should call methods directly on the `map` instance returned here, not
// rely on this hook re-running.

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

export interface UseMapLibreOptions {
  options?: Partial<maplibregl.MapOptions>;
  onLoad?: (map: maplibregl.Map) => void;
}

export interface UseMapLibreResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  map: maplibregl.Map | null;
}

export function useMapLibre({ options, onLoad }: UseMapLibreOptions = {}): UseMapLibreResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const instance = new maplibregl.Map({
      style: BLANK_STYLE,
      center: [0, 0],
      zoom: 0,
      ...options,
      container: containerRef.current,
    });

    if (onLoad) {
      instance.on('load', () => onLoad(instance));
    }

    setMap(instance);

    return () => {
      instance.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, map };
}