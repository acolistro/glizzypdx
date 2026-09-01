// src/features/vendor-map/components/PortlandMap.test.tsx
//
// Paired test file for GLPDX-21 (ticket GLPDX-184). Same mocking approach
// as GLPDX-182/183: maplibre-gl needs real WebGL, unavailable in Vitest's
// jsdom, so we mock the library entirely and assert on how it was
// *called* rather than rendering a real map. Real WebGL rendering is
// deferred to Playwright E2E (GLPDX-26).
//
// What this file verifies (per GLPDX-184's Jira description):
//   1. The map is centered on Portland metro coordinates on initial render
//   2. The real Stadia style is used (not GLPDX-22's blank default style)
//   3. PortlandMap composes GLPDX-22's <Map> component rather than
//      reimplementing map instantiation itself

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type maplibregl from 'maplibre-gl';
import { PortlandMap } from './PortlandMap';
import { PORTLAND_METRO_CENTER, PORTLAND_METRO_DEFAULT_ZOOM } from '../lib/portlandMetro';
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

describe('PortlandMap', () => {
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
});