// src/features/vendor-map/components/PortlandMap.test.tsx
//
// Paired test file for GLPDX-21 (ticket GLPDX-184), extended by GLPDX-24
// (default map bounds) and GLPDX-33 (onLoad passthrough).
//
// Same mocking approach as GLPDX-182/183: maplibre-gl needs real WebGL,
// unavailable in Vitest's jsdom, so we mock the library entirely and
// assert on how it was *called* rather than rendering a real map. Real
// WebGL rendering is deferred to Playwright E2E (GLPDX-26).
//
// What this file verifies:
//   1. The map is centered on Portland metro coordinates on initial render (GLPDX-21)
//   2. The real Stadia style is used (not GLPDX-22's blank default style) (GLPDX-21)
//   3. PortlandMap composes GLPDX-22's <Map> component rather than
//      reimplementing map instantiation itself (GLPDX-21)
//   4. Panning is constrained to the Portland metro bounding box (GLPDX-24)
//   5. PortlandMap forwards an onLoad prop through to <Map>, so a
//      consumer (GLPDX-33's vendor-pin rendering) can get a handle on
//      the real maplibregl.Map instance once it's ready (GLPDX-33)

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type maplibregl from 'maplibre-gl';
import { PortlandMap } from './PortlandMap';
import {
  PORTLAND_METRO_CENTER,
  PORTLAND_METRO_DEFAULT_ZOOM,
  PORTLAND_METRO_BOUNDS,
} from '../lib/portlandMetro';
import { getDefaultStadiaStyleUrl } from '../lib/stadiaStyle';

// Mock maplibre-gl the same way GLPDX-182's useMapLibre.test.tsx does:
// jsdom has no WebGL, so the real library would throw on construction.
// We only need to assert on *what* maplibregl.Map was constructed with,
// not on real map behavior.
//
// Important: this MUST be a real `function`, not an arrow function.
// useMapLibre.ts calls `new maplibregl.Map({...})` — arrow functions
// can't be invoked with `new`, so an arrow-function mock throws
// "TypeError: default.Map is not a constructor" the moment the hook
// runs, even though the test itself is otherwise correct.
//
// Typed as `Partial<maplibregl.MapOptions>` (rather than left as
// `unknown`) so `MockMapConstructor.mock.calls` — read below via
// destructuring — comes back typed instead of `unknown`, which is what
// `pnpm tsc --build --noEmit` was catching (TS18046) before this fix.
const mockMapInstance = {
  on: vi.fn(),
  remove: vi.fn(),
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- param establishes the mock's call signature for type inference; body doesn't need to read it
const MockMapConstructor = vi.fn(function (_options: Partial<maplibregl.MapOptions>) {
  return mockMapInstance;
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: function (options: Partial<maplibregl.MapOptions>) {
      return MockMapConstructor(options);
    },
  },
}));

// Mock config/env rather than letting the real eager-validating env.ts
// load — see GLPDX-7's known bug pattern: a test file statically
// importing PortlandMap.tsx transitively statically imports env.ts,
// which validates ALL required vars (Supabase URL/key, Turnstile key)
// at import time, not just the stadiaMapsApiKey this component actually
// reads. That makes the test depend on real environment configuration
// being present, which is exactly what stubbing/mocking env exists to
// avoid — this failed in CI (missing VITE_TURNSTILE_SITE_KEY) despite
// passing locally, where a real .env happened to have every var set.
vi.mock('../../../config/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
    turnstileSiteKey: 'test-turnstile-site-key',
    stadiaMapsApiKey: undefined,
    analyticsDomain: undefined,
  },
}));

describe('PortlandMap', () => {
  // NEW (GLPDX-33): mockMapInstance is a single shared object returned
  // by every call to MockMapConstructor across every test in this file
  // — its `on`/`remove` spies were never being reset between tests
  // before now. That was harmless while no test inspected `on.mock.calls`,
  // but the new onLoad-passthrough test below needs to find exactly one
  // 'load' registration from its own render, not an accumulation of
  // registrations left over from earlier tests in this file.
  beforeEach(() => {
    MockMapConstructor.mockClear();
    mockMapInstance.on.mockClear();
    mockMapInstance.remove.mockClear();
  });

  it('centers the map on Portland metro coordinates on initial render', () => {
    render(<PortlandMap />);

    // The underlying maplibregl.Map constructor (invoked inside
    // GLPDX-22's useMapLibre hook, which PortlandMap composes via <Map>)
    // should have been called with Portland's center coordinates.
    expect(MockMapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        center: PORTLAND_METRO_CENTER,
        zoom: PORTLAND_METRO_DEFAULT_ZOOM,
      })
    );
  });

  it('uses the real Stadia style, not the blank default style from GLPDX-22', () => {
    render(<PortlandMap />);

    // getDefaultStadiaStyleUrl() with no args (no API key stubbed in this
    // test) produces the keyless localhost-dev URL — see GLPDX-23. The
    // key assertion here is that it's a Stadia URL, not GLPDX-22's blank
    // `{ version: 8, sources: {}, layers: [] }` style object.
    const [[callArgs]] = MockMapConstructor.mock.calls;
    expect(callArgs.style).toBe(getDefaultStadiaStyleUrl());
    expect(callArgs.style).not.toEqual(
      expect.objectContaining({ version: 8, sources: {}, layers: [] })
    );
  });

  it('renders a single map container, composing GLPDX-22\'s Map component', () => {
    const { getByTestId } = render(<PortlandMap />);

    // data-testid="map-container" comes from GLPDX-22's <Map> component
    // (see components/Map.tsx) — its presence here is evidence PortlandMap
    // is composing <Map> rather than rendering its own container div and
    // reimplementing map instantiation.
    expect(getByTestId('map-container')).toBeInTheDocument();
  });

  it('constrains panning to the Portland metro bounding box (GLPDX-24)', () => {
    render(<PortlandMap />);

    // maxBounds is MapLibre's built-in mechanism for constraining pan —
    // see GLPDX-24's Jira description. PORTLAND_METRO_BOUNDS is a large,
    // inclusive box covering not just inner Portland but the commuter/
    // dining catchment area: west to Hillsboro, east to Gresham/
    // Troutdale, south to Wilsonville/Oregon City, north well into
    // Vancouver WA. Shared with GLPDX-25, which verifies the runtime
    // pan-restriction behavior this produces.
    expect(MockMapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBounds: PORTLAND_METRO_BOUNDS,
      })
    );
  });

  // NEW (GLPDX-33): PortlandMap currently accepts no props at all — its
  // own module comment (as of GLPDX-21) explicitly says nothing
  // downstream needs the map instance yet. GLPDX-33 is that first
  // consumer: vendor-pin rendering needs a real maplibregl.Map to add
  // markers to. This test currently fails because PortlandMap has no
  // onLoad prop to forward — that's the point; implementation comes
  // after this is confirmed red for the right reason (a missing prop,
  // not a typo or setup mistake).
  it('forwards an onLoad prop through to the underlying Map, so a consumer can get the real map instance (GLPDX-33)', () => {
    const onLoad = vi.fn();
    render(<PortlandMap onLoad={onLoad} />);

    // useMapLibre (inside <Map>) registers its 'load' handler via
    // map.on('load', ...). We capture that handler here and invoke it
    // ourselves, mirroring how Map.test.tsx's MockMap.__trigger()
    // simulates MapLibre firing the real 'load' event — PortlandMap.test.tsx
    // mocks the maplibre-gl library directly (not the <Map> component),
    // so there's no __trigger helper available here; reading the handler
    // straight off the spy's recorded calls is the equivalent for this
    // file's mocking style.
    const loadRegistration = mockMapInstance.on.mock.calls.find(
      ([eventName]) => eventName === 'load'
    );
    expect(loadRegistration).toBeDefined();

    const loadHandler = loadRegistration?.[1] as () => void;
    loadHandler();

    // onLoad should receive the real map instance (mockMapInstance here),
    // not be called with no arguments or with PortlandMap's own props —
    // this is what lets GLPDX-33's vendor-pin components add markers to
    // the actual map.
    expect(onLoad).toHaveBeenCalledWith(mockMapInstance);
  });
});