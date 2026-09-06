// src/features/vendor-map/components/VendorMapView.test.tsx
//
// GLPDX-33 (paired test ticket GLPDX-185) — VendorMapView composes
// PortlandMap, both vendor-pin data hooks, and ShowInactiveToggle into
// the actual public-facing vendor map.
//
// Mocking approach: same maplibre-gl-library mock as PortlandMap.test.tsx
// (a shared mockMapInstance returned by every constructor call), since
// this file renders <PortlandMap> for real rather than mocking it away —
// that's deliberate, so these tests also prove PortlandMap's onLoad prop
// (added earlier this session) is actually wired up correctly end to
// end, not just at PortlandMap's own layer.
//
// Both pin-fetching hooks are mocked entirely — this file is only
// concerned with composition (does VendorMapView correctly turn hook
// data into map source features, does the toggle correctly gate the
// last-known hook), not with re-testing useActiveVendorPins/
// useLastKnownVendorPins's own Supabase-query internals, which already
// have their own merged test files.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type maplibregl from 'maplibre-gl';
import {
  VendorMapView,
  VENDOR_PINS_SOURCE_ID,
  VENDOR_PINS_LAYER_ID,
} from './VendorMapView';

// Same maplibre-gl mock shape as PortlandMap.test.tsx, extended with the
// source/layer methods this component actually calls. Must be a real
// `function`, not an arrow function — see PortlandMap.test.tsx's own
// comment on why (useMapLibre calls `new maplibregl.Map(...)`).
const mockSetData = vi.fn();
const mockMapInstance = {
  on: vi.fn(),
  remove: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getSource: vi.fn(() => ({ setData: mockSetData })),
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

// Same env-mocking rationale as PortlandMap.test.tsx: this file
// transitively imports config/env.ts via PortlandMap, and that module
// eagerly validates every required env var at import time (GLPDX-7).
vi.mock('../../../config/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
    turnstileSiteKey: 'test-turnstile-site-key',
    stadiaMapsApiKey: undefined,
    analyticsDomain: undefined,
  },
}));

// Deterministic, easily-asserted-on stand-ins for the real design token
// colors — the point of this test file is to prove VendorMapView reads
// colors via readCssColorToken() (and therefore ultimately from
// tokens.css), NOT to re-verify tokens.css's actual hex values, which
// belongs to tokens.test.ts.
vi.mock('../lib/mapTokenColors', () => ({
  readCssColorToken: vi.fn((tokenName: string) => `mock-color(${tokenName})`),
}));

// Both pin-fetching hooks mocked entirely — see module comment above.
// Declared as vi.fn() so individual tests can control both the
// returned data AND assert on what arguments VendorMapView called them
// with (specifically: did the toggle's boolean state actually reach
// useLastKnownVendorPins's `enabled` parameter).
const mockUseActiveVendorPins = vi.fn();
vi.mock('../hooks/useActiveVendorPins', () => ({
  useActiveVendorPins: () => mockUseActiveVendorPins(),
}));

const mockUseLastKnownVendorPins = vi.fn();
vi.mock('../hooks/useLastKnownVendorPins', () => ({
  useLastKnownVendorPins: (enabled: boolean) => mockUseLastKnownVendorPins(enabled),
}));

const fakeActivePin = {
  id: 'checkin-active-1',
  lat: 45.523,
  lng: -122.676,
  area_label: 'SE Division & 30th',
  expires_at: '2026-09-06T18:00:00.000Z',
  vendor_id: 'vendor-1',
  vendors: { id: 'vendor-1', name: 'Pink Dog Carts' },
};

const fakeLastKnownPin = {
  id: 'checkin-last-known-1',
  lat: 45.5,
  lng: -122.65,
  area_label: 'North Portland',
  expires_at: '2026-09-01T18:00:00.000Z',
  vendor_id: 'vendor-2',
  vendors: { id: 'vendor-2', name: 'Wandering Wieners', show_last_known: true },
};

/** Fires the mocked maplibregl.Map's registered 'load' handler, the
 * same way PortlandMap.test.tsx simulates MapLibre's real 'load' event
 * for this file's mocking style (mocking the library directly rather
 * than mocking <PortlandMap>).
 *
 * Wrapped in act(): the load handler synchronously calls
 * setMapLoaded(true) inside VendorMapView. Because this function is a
 * plain manual call (not something React Testing Library's own render/
 * user-event helpers wrap automatically), React warns that a state
 * update happened outside its managed update cycle unless we wrap it in
 * act() ourselves — this is exactly what act() exists for. */
function triggerMapLoad() {
  const loadRegistration = mockMapInstance.on.mock.calls.find(
    ([eventName]) => eventName === 'load'
  );
  const loadHandler = loadRegistration?.[1] as (() => void) | undefined;

  act(() => {
    loadHandler?.();
  });
}

describe('VendorMapView', () => {
  beforeEach(() => {
    MockMapConstructor.mockClear();
    mockMapInstance.on.mockClear();
    mockMapInstance.remove.mockClear();
    mockMapInstance.addSource.mockClear();
    mockMapInstance.addLayer.mockClear();
    mockMapInstance.getSource.mockClear();
    mockSetData.mockClear();

    // Default: no active pins, toggle off (so useLastKnownVendorPins(false)
    // is the default call shape) — individual tests override as needed.
    mockUseActiveVendorPins.mockReturnValue({ data: [] });
    mockUseLastKnownVendorPins.mockImplementation((enabled: boolean) => ({
      data: enabled ? [fakeLastKnownPin] : undefined,
    }));
  });

  it('renders the map and the show-inactive toggle', () => {
    render(<VendorMapView />);

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /show inactive/i })).toBeInTheDocument();
  });

  it('adds a GeoJSON source and a circle layer for vendor pins once the map loads', () => {
    render(<VendorMapView />);

    // Before 'load' fires, nothing should be added yet — this is what
    // proves the source/layer setup genuinely waits for MapLibre's own
    // readiness event rather than running immediately on mount, which
    // would fail against a real (non-mocked) MapLibre instance that
    // isn't ready to accept layers yet.
    expect(mockMapInstance.addSource).not.toHaveBeenCalled();

    triggerMapLoad();

    expect(mockMapInstance.addSource).toHaveBeenCalledWith(
      VENDOR_PINS_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' })
    );
    expect(mockMapInstance.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: VENDOR_PINS_LAYER_ID,
        source: VENDOR_PINS_SOURCE_ID,
        type: 'circle',
      })
    );
  });

  it("colors the vendor-pins layer using design tokens read via readCssColorToken, not hardcoded colors", () => {
    render(<VendorMapView />);
    triggerMapLoad();

    const [[layerConfig]] = mockMapInstance.addLayer.mock.calls;
    const paintValue = JSON.stringify(layerConfig.paint);

    // Asserting the mocked token-reader's distinctive output appears in
    // the paint config proves colors flow through readCssColorToken()
    // (and therefore ultimately from tokens.css) rather than a
    // hardcoded hex value baked directly into this component.
    expect(paintValue).toContain('mock-color(--color-status-active)');
    expect(paintValue).toContain('mock-color(--color-status-last-known)');
  });

  it('populates the map source with one feature per active vendor pin after load', async () => {
    mockUseActiveVendorPins.mockReturnValue({ data: [fakeActivePin] });

    render(<VendorMapView />);
    triggerMapLoad();

    await waitFor(() => expect(mockSetData).toHaveBeenCalled());

    const [lastCall] = mockSetData.mock.calls.at(-1)!;
    const featureCollection = lastCall as GeoJSON.FeatureCollection;

    expect(featureCollection.type).toBe('FeatureCollection');
    expect(featureCollection.features).toHaveLength(1);
    expect(featureCollection.features[0]).toEqual(
      expect.objectContaining({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [fakeActivePin.lng, fakeActivePin.lat] },
        properties: expect.objectContaining({ status: 'active' }),
      })
    );
  });

  it('excludes last-known pins from the map source while the toggle is off', async () => {
    mockUseActiveVendorPins.mockReturnValue({ data: [] });
    // Default mockUseLastKnownVendorPins implementation already returns
    // `data: undefined` when called with `false` — matching the real
    // hook's toggle-gated-fetch behavior (no data until enabled).

    render(<VendorMapView />);
    triggerMapLoad();

    await waitFor(() => expect(mockSetData).toHaveBeenCalled());

    expect(mockUseLastKnownVendorPins).toHaveBeenCalledWith(false);

    const [lastCall] = mockSetData.mock.calls.at(-1)!;
    const featureCollection = lastCall as GeoJSON.FeatureCollection;
    expect(featureCollection.features).toHaveLength(0);
  });

  it('includes last-known pins in the map source once the toggle is switched on', async () => {
    const user = userEvent.setup();
    mockUseActiveVendorPins.mockReturnValue({ data: [] });

    render(<VendorMapView />);
    triggerMapLoad();
    await waitFor(() => expect(mockSetData).toHaveBeenCalled());
    mockSetData.mockClear();

    await user.click(screen.getByRole('switch', { name: /show inactive/i }));

    // Confirms the toggle's boolean state actually reaches
    // useLastKnownVendorPins's `enabled` parameter — this is the
    // "toggle-gated fetch" contract GLPDX-33's Jira description
    // requires: the hook itself decides whether to fetch based on this
    // argument, so VendorMapView's only job is passing the real current
    // toggle state through.
    expect(mockUseLastKnownVendorPins).toHaveBeenCalledWith(true);

    await waitFor(() => expect(mockSetData).toHaveBeenCalled());
    const [lastCall] = mockSetData.mock.calls.at(-1)!;
    const featureCollection = lastCall as GeoJSON.FeatureCollection;

    expect(featureCollection.features).toHaveLength(1);
    expect(featureCollection.features[0]).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({ status: 'last-known' }),
      })
    );
  });
});