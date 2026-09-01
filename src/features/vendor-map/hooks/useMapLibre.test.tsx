// src/features/vendor-map/hooks/useMapLibre.test.tsx
//
// GLPDX-182 (paired test ticket for GLPDX-22)
//
// What this tests: useMapLibre's guard against running before its
// containerRef has been attached to a real DOM element. Map.tsx always
// renders the ref'd <div> unconditionally, so this branch is never
// reachable through Map.tsx's own tests (see Map.test.tsx) — hence a
// separate, direct test on the hook itself, calling it via
// `renderHook` WITHOUT rendering anything that attaches the ref. That's
// exactly the scenario the guard exists to handle.
//
// Where the data comes from / goes: same maplibre-gl mocking approach as
// Map.test.tsx (see the comments there for why it's mocked). This file
// declares its own copy of the mock rather than importing Map.test.tsx's,
// since each test file's vi.mock is scoped to that file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import { useMapLibre } from './useMapLibre';

vi.mock('maplibre-gl', () => {
  class MockMap {
    static instances: MockMap[] = [];
    options: Record<string, unknown>;
    remove = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockMap.instances.push(this);
    }

    on() {
      // Not exercised in this file's tests — present only so the real
      // API shape is satisfied if it were ever called.
    }
  }

  return { default: { Map: MockMap } };
});

const MockMap = maplibregl.Map as unknown as {
  instances: Array<{ options: Record<string, unknown>; remove: ReturnType<typeof vi.fn> }>;
};

describe('useMapLibre (GLPDX-22)', () => {
  beforeEach(() => {
    MockMap.instances.length = 0;
  });

  it('does not create a map instance if containerRef is never attached to a DOM element', () => {
    renderHook(() => useMapLibre());

    expect(MockMap.instances).toHaveLength(0);
  });
});