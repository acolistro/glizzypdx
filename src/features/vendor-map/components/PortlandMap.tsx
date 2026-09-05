// src/features/vendor-map/components/PortlandMap.tsx
//
// GLPDX-21 — the real, user-facing Portland-metro base map. This is
// deliberately a thin composition layer: it doesn't talk to maplibre-gl
// directly at all. Instead it wires together three things that already
// exist from earlier tickets:
//   - GLPDX-22's <Map> component (components/Map.tsx), which owns the
//     actual MapLibre map instance via the useMapLibre hook
//   - GLPDX-23's getDefaultStadiaStyleUrl() (lib/stadiaStyle.ts), which
//     builds the real Stadia Maps tile style URL
//   - GLPDX-21's own PORTLAND_METRO_CENTER / PORTLAND_METRO_DEFAULT_ZOOM
//     (lib/portlandMetro.ts)
//
// Where its data comes from: env.stadiaMapsApiKey (src/config/env.ts,
// GLPDX-7) for the Stadia API key. The key is optional — see
// lib/stadiaStyle.ts's module comment — so this component works
// keyless in local dev and with a real key in production, without any
// conditional logic here; getDefaultStadiaStyleUrl() already handles
// omitting the key when it's undefined.
//
// Where its output goes: rendered UI — this is the map users actually
// see. As of GLPDX-33, it also accepts an onLoad callback, forwarded
// straight through to <Map>, so a parent component can get a handle on
// the real maplibregl.Map instance once MapLibre fires its 'load'
// event — needed by GLPDX-33's vendor-pin rendering, which adds
// markers onto this map imperatively once it's ready.
//
// Non-obvious pattern: PortlandMap now takes exactly one optional prop
// (onLoad), still resolutely NOT a general-purpose configurable map —
// the Stadia key, Portland center/zoom, and bounds still all come from
// module imports (env, constants), not from parent-passed props. Adding
// onLoad is a deliberate, minimal prop addition to satisfy a real
// consumer (GLPDX-33), not a step toward making this component
// generic — see the original GLPDX-21 comment on this file for why
// that distinction matters (YAGNI: add configurability when a real
// need shows up, not speculatively).

import type maplibregl from 'maplibre-gl';
import { Map } from './Map';
import { env } from '../../../config/env';
import { getDefaultStadiaStyleUrl } from '../lib/stadiaStyle';
import {
  PORTLAND_METRO_CENTER,
  PORTLAND_METRO_DEFAULT_ZOOM,
  PORTLAND_METRO_BOUNDS,
} from '../lib/portlandMetro';

export interface PortlandMapProps {
  /**
   * Called once MapLibre fires its 'load' event, with the real
   * maplibregl.Map instance. Optional — most renders of PortlandMap
   * (e.g. anywhere that doesn't need to add markers or otherwise talk
   * to the map directly) can omit this entirely. Forwarded verbatim to
   * <Map>'s own onLoad prop (see components/Map.tsx), which is where
   * the actual event subscription lives.
   */
  onLoad?: (map: maplibregl.Map) => void;
}

export function PortlandMap({ onLoad }: PortlandMapProps) {
  return (
    <Map
      options={{
        style: getDefaultStadiaStyleUrl(env.stadiaMapsApiKey),
        center: PORTLAND_METRO_CENTER,
        zoom: PORTLAND_METRO_DEFAULT_ZOOM,
        maxBounds: PORTLAND_METRO_BOUNDS,
      }}
      onLoad={onLoad}
    />
  );
}