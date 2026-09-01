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
// Where its output goes: rendered UI — this is meant to be the map users
// actually see. Nothing yet reads a `map` instance back out of this
// component (no onLoad passed to <Map>) because nothing downstream needs
// it yet; GLPDX-33 (vendor pins) will be the first ticket to need that,
// via <Map>'s onLoad prop.
//
// Non-obvious pattern: no props on this component (yet). Everything it
// needs — the Stadia key, the Portland center/zoom — comes from module
// imports (env, constants), not from a parent component passing them
// down. That's intentional: PortlandMap IS "the Portland map," not a
// generic reusable map that happens to default to Portland. If a future
// ticket needs a configurable center (e.g. an admin preview at a
// different location), that's a deliberate prop addition to make then,
// not something to speculatively add now (YAGNI).

import { Map } from './Map';
import { env } from '../../../config/env';
import { getDefaultStadiaStyleUrl } from '../lib/stadiaStyle';
import { PORTLAND_METRO_CENTER, PORTLAND_METRO_DEFAULT_ZOOM } from '../lib/portlandMetro';

export function PortlandMap() {
  return (
    <Map
      options={{
        style: getDefaultStadiaStyleUrl(env.stadiaMapsApiKey),
        center: PORTLAND_METRO_CENTER,
        zoom: PORTLAND_METRO_DEFAULT_ZOOM,
      }}
    />
  );
}