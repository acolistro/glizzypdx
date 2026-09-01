// src/features/vendor-map/components/Map.test.tsx
//
// GLPDX-182 (paired test ticket for GLPDX-22)
//
// What this tests: the <Map> component, a thin wrapper around the
// useMapLibre custom hook (src/features/vendor-map/hooks/useMapLibre.ts).
// Testing through the component (rather than testing the hook in
// isolation) is deliberate: the hook's containerRef needs to be attached
// to a real, mounted DOM node before its effect will run, and rendering
// <Map/> via React Testing Library gives us that for free.
//
// Where the data comes from: `render()` mounts <Map/> into a real (jsdom)
// DOM. maplibre-gl itself is mocked below — see the vi.mock block — since
// the real library needs WebGL, which jsdom doesn't implement.
//
// Where the results go: nowhere outside this file. These assertions check
// that <Map> talks to maplibregl.Map correctly (right container, right
// default style, right lifecycle), not that anything visually renders.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import { Map } from './Map';

// Mocking maplibre-gl: the real library's Map class talks to WebGL, which
// doesn't exist in jsdom. This mock stands in for it, tracking every
// instance created (so tests can inspect what options it was constructed
// with) and providing just enough of the real API (on/remove) for the
// hook's lifecycle logic to run against.
vi.mock('maplibre-gl', () => {
  class MockMap {
    // Static so tests (outside any single instance) can inspect every
    // Map that got created during a render.
    static instances: MockMap[] = [];

    options: Record<string, unknown>;
    // Maps each registered event name (e.g. 'load') to the callbacks
    // subscribed via .on(), mimicking the real Map's event emitter just
    // enough for tests to manually fire events.
    private handlers: Record<string, Array<() => void>> = {};
    remove = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMap.instances.push(this);
    }

    on(event: string, callback: () => void) {
      (this.handlers[event] ??= []).push(callback);
    }

    // Test-only helper (not part of the real maplibre-gl API) — lets a
    // test simulate MapLibre firing an event, e.g. 'load'.
    __trigger(event: string) {
      (this.handlers[event] ?? []).forEach((callback) => callback());
    }
  }

  return { default: { Map: MockMap } };
});

// Cast the mocked constructor so tests can reach the test-only
// `instances` and `__trigger` additions above, which aren't part of the
// real maplibre-gl type definitions.
const MockMap = maplibregl.Map as unknown as {
  instances: Array<{
    options: Record<string, unknown>;
    remove: ReturnType<typeof vi.fn>;
    __trigger: (event: string) => void;
  }>;
};

describe('Map (GLPDX-22)', () => {
  beforeEach(() => {
    // Reset tracked instances between tests so assertions like
    // `toHaveLength(1)` aren't polluted by a previous test's render.
    MockMap.instances.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('instantiates maplibregl.Map with the rendered container element', () => {
    const { container } = render(<Map />);
    const mapDiv = container.querySelector('[data-testid="map-container"]');

    expect(MockMap.instances).toHaveLength(1);
    expect(MockMap.instances[0].options.container).toBe(mapDiv);
  });

  it('defaults to a blank style — no Stadia tiles, no Portland bounds (GLPDX-22 scope; those come in GLPDX-23/21)', () => {
    render(<Map />);

    expect(MockMap.instances[0].options.style).toEqual({
      version: 8,
      sources: {},
      layers: [],
    });
  });

  it('merges caller-provided options over the defaults', () => {
    render(<Map options={{ zoom: 12, center: [-122.6765, 45.5231] }} />);

    expect(MockMap.instances[0].options.zoom).toBe(12);
    expect(MockMap.instances[0].options.center).toEqual([-122.6765, 45.5231]);
  });

  it('calls onLoad with the map instance once MapLibre fires its "load" event', () => {
    const onLoad = vi.fn();
    render(<Map onLoad={onLoad} />);

    expect(onLoad).not.toHaveBeenCalled();

    MockMap.instances[0].__trigger('load');

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(MockMap.instances[0]);
  });

  it('calls map.remove() on unmount, so no MapLibre instance leaks after the component is gone', () => {
    const { unmount } = render(<Map />);
    const instance = MockMap.instances[0];

    unmount();

    expect(instance.remove).toHaveBeenCalledTimes(1);
  });
});