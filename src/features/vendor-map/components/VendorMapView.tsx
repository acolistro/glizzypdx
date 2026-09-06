// src/features/vendor-map/components/VendorMapView.tsx
//
// GLPDX-33 (paired test ticket GLPDX-185) — the component that actually
// makes vendor pins visible on the public map. Composes three pieces
// built earlier this session/ticket:
//   - PortlandMap (GLPDX-21), via its onLoad prop (GLPDX-33 addition)
//     to get a handle on the real maplibregl.Map instance
//   - useActiveVendorPins / useLastKnownVendorPins (GLPDX-33), the two
//     data-fetching hooks
//   - ShowInactiveToggle (GLPDX-33), the "show inactive" UI control
//
// Where its data comes from: the two pin hooks (ultimately Supabase,
// filtered server-side by RLS — see GLPDX-12) and its own `showInactive`
// state (owned here, not inside ShowInactiveToggle — see that
// component's own comment on why it's a controlled component).
//
// Where its output goes: rendered UI (the map itself, plus the toggle
// floating over it) and, imperatively, MapLibre's own GeoJSON source —
// see the "GeoJSON source + data-driven layer" note below for why pins
// aren't rendered as individual React elements at all.
//
// MARKER-RENDERING APPROACH — GeoJSON source + data-driven layer, not
// individual DOM Markers: this was a deliberate choice over MapLibre's
// `Marker` class (which creates one real DOM element per pin). With one
// GeoJSON source and one `circle` layer, updating the pins on screen is
// just "hand MapLibre the current full set of pins" (`source.setData`)
// — MapLibre handles adding/removing/repositioning them internally,
// on the GPU, with no manual diffing code to get wrong. This matters
// here specifically because the real vendor set will include mobile
// carts, stationary carts, AND restaurants — potentially many pins,
// many of them constantly active — which is exactly the scenario
// MapLibre's own documentation recommends this approach for over
// individual DOM markers.
//
// Non-obvious pattern — WHY handleMapLoad HAS NO DEPENDENCIES: it would
// be tempting to make handleMapLoad read `activePinsQuery.data` directly
// so the very first `addSource` call could include real data instead of
// an empty placeholder. That would require handleMapLoad's identity to
// change whenever pin data changes (since it's a closure over that
// data), which risks the effect inside useMapLibre (PortlandMap → Map)
// treating a changed `onLoad` reference as a reason to tear down and
// recreate the ENTIRE MapLibre map on every data refetch — clearly
// wrong. Instead, handleMapLoad stays referentially stable forever
// (empty dependency array) and only sets up the source/layer once and
// flips `mapLoaded` to true. The separate `useEffect` below — which DOES
// depend on the live pin data — is what actually pushes real data into
// the map, both for the very first population (triggered by `mapLoaded`
// flipping to true) and every update after.

import { useCallback, useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { PortlandMap } from './PortlandMap';
import { ShowInactiveToggle } from './ShowInactiveToggle';
import { useActiveVendorPins, type ActiveVendorPin } from '../hooks/useActiveVendorPins';
import { useLastKnownVendorPins } from '../hooks/useLastKnownVendorPins';
import { readCssColorToken } from '../lib/mapTokenColors';
import styles from './VendorMapView.module.css';

/**
 * Mirrors the row shape returned by useLastKnownVendorPins — that hook
 * doesn't currently export its own named type, so this is hand-declared
 * here rather than left as `unknown`/`any`. If useLastKnownVendorPins is
 * ever updated to export its own type, this local one should be
 * replaced with that import instead of kept as a second, potentially
 * drifting definition of the same shape.
 */
interface LastKnownVendorPin {
  id: string;
  lat: number;
  lng: number;
  area_label: string | null;
  expires_at: string;
  vendor_id: string;
  vendors: {
    id: string;
    name: string;
    show_last_known: boolean;
  };
}

/** IDs for the single GeoJSON source and single circle layer this
 * component manages. Exported so tests can assert against the exact
 * same identifiers this component uses internally, rather than
 * duplicating the literal strings in both places (which could silently
 * drift out of sync). */
export const VENDOR_PINS_SOURCE_ID = 'vendor-pins-source';
export const VENDOR_PINS_LAYER_ID = 'vendor-pins-layer';

/** Starting state for the GeoJSON source, before any real pin data has
 * arrived. An empty FeatureCollection is a valid, well-formed GeoJSON
 * object — MapLibre needs *some* valid data to create the source with,
 * even before the first real setData() call happens. */
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Turns the two hooks' pin rows into one combined GeoJSON
 * FeatureCollection — the single shape MapLibre's `source.setData()`
 * expects. Each feature carries a `status` property ('active' or
 * 'last-known'), which is what the layer's paint expression (see
 * handleMapLoad below) reads to pick the right color per pin.
 */
function buildVendorPinFeatureCollection(
  activePins: ActiveVendorPin[],
  lastKnownPins: LastKnownVendorPin[]
): GeoJSON.FeatureCollection {
  const activeFeatures: GeoJSON.Feature[] = activePins.map((pin) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
    properties: {
      id: pin.id,
      status: 'active',
      vendorId: pin.vendors.id,
      vendorName: pin.vendors.name,
    },
  }));

  const lastKnownFeatures: GeoJSON.Feature[] = lastKnownPins.map((pin) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
    properties: {
      id: pin.id,
      status: 'last-known',
      vendorId: pin.vendors.id,
      vendorName: pin.vendors.name,
      // Carried through for a future consumer (GLPDX-39's bottom sheet)
      // even though nothing reads it yet — the pin itself intentionally
      // shows no on-pin timestamp text, per GLPDX-33's 2026-09-05
      // correction (accessibility + map-UX-convention reasoning).
      expiresAt: pin.expires_at,
    },
  }));

  return {
    type: 'FeatureCollection',
    features: [...activeFeatures, ...lastKnownFeatures],
  };
}

export function VendorMapView() {
  // Owned here, not inside ShowInactiveToggle — see that component's
  // own "controlled component" comment for why. This is the single
  // source of truth for whether last-known pins are being requested at
  // all (see the toggle-gated-fetch note on useLastKnownVendorPins).
  const [showInactive, setShowInactive] = useState(false);

  // Tracks whether the underlying MapLibre map has fired its 'load'
  // event and had its source/layer set up — see the module comment
  // above for why this (not a dependency on handleMapLoad) is what
  // drives the data-population effect below.
  const [mapLoaded, setMapLoaded] = useState(false);

  // A ref, not state — the map instance itself never needs to trigger a
  // re-render when it's captured; only mapLoaded flipping does that.
  const mapRef = useRef<maplibregl.Map | null>(null);

  const activePinsQuery = useActiveVendorPins();
  const lastKnownPinsQuery = useLastKnownVendorPins(showInactive);

  const handleMapLoad = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;

    map.addSource(VENDOR_PINS_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });

    map.addLayer({
      id: VENDOR_PINS_LAYER_ID,
      type: 'circle',
      source: VENDOR_PINS_SOURCE_ID,
      paint: {
        'circle-radius': 8,
        // A MapLibre 'match' expression: reads each feature's 'status'
        // property and picks the matching color. The final argument
        // ('active's color again) is the expression's required
        // fallback for any status value that matches neither case —
        // MapLibre's 'match' expression syntax requires a fallback,
        // even though every feature this component creates always sets
        // status to one of the two matched values.
        'circle-color': [
          'match',
          ['get', 'status'],
          'active',
          readCssColorToken('--color-status-active'),
          'last-known',
          readCssColorToken('--color-status-last-known'),
          readCssColorToken('--color-status-active'),
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': readCssColorToken('--color-white'),
      },
    });

    setMapLoaded(true);
  }, []);

  // The actual data-population effect. Runs once right after
  // handleMapLoad flips mapLoaded to true (populating the map for the
  // first time), and again every time the underlying pin data changes
  // afterward (new checkins appearing, TanStack Query's staleTime
  // triggering a refetch, or the toggle changing which pins
  // useLastKnownVendorPins returns).
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // Non-null assertion, not an `if (!source) return` guard:
    // handleMapLoad calls addSource(VENDOR_PINS_SOURCE_ID, ...)
    // synchronously on this exact map instance BEFORE it ever sets
    // mapLoaded to true, and this effect only runs once mapLoaded is
    // true. There is no code path where this effect runs and that
    // source doesn't already exist — an `if (!source) return` guard
    // here would be untested dead code for a state that can't
    // structurally occur, the same reasoning that removed an
    // equivalent unreachable fallback from useActiveVendorPins.ts
    // earlier in this ticket.
    const source = mapRef.current.getSource(
      VENDOR_PINS_SOURCE_ID
    ) as maplibregl.GeoJSONSource;

    const activePins = activePinsQuery.data ?? [];
    const lastKnownPins = lastKnownPinsQuery.data ?? [];

    source.setData(buildVendorPinFeatureCollection(activePins, lastKnownPins));
  }, [mapLoaded, activePinsQuery.data, lastKnownPinsQuery.data]);

  return (
    <div className={styles.container}>
      <PortlandMap onLoad={handleMapLoad} />
      <ShowInactiveToggle checked={showInactive} onChange={setShowInactive} />
    </div>
  );
}