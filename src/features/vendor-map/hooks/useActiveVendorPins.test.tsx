import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useActiveVendorPins } from "./useActiveVendorPins";

// Mock the Supabase client module so we never make a real network call in
// tests. useActiveVendorPins builds a chained query:
//   supabase.from('checkins').select(...).gt('expires_at', ...)
// so the mock needs to support that chain, unlike useVendorInquiry's mock
// (which only needed to fake `.functions.invoke`). `.from()` and
// `.select()` return `this`-like chainable objects here; `.gt()` is the
// terminal call that actually resolves with { data, error }, matching how
// supabase-js's real query builder resolves a promise at the end of a
// chain.
vi.mock("../../../lib/supabase", () => {
  const mockGt = vi.fn();
  const mockSelect = vi.fn(() => ({ gt: mockGt }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return {
    supabase: {
      from: mockFrom,
    },
    __mocks: { mockFrom, mockSelect, mockGt },
  };
});

// Importing the mocked module AFTER vi.mock so we get the mocked version.
// The `__mocks` export is a test-only escape hatch to reach the inner
// spies without re-deriving them from `supabase.from` on every test.
import { supabase } from "../../../lib/supabase";
// @ts-expect-error -- __mocks is a test-only addition to the mocked module, not part of the real supabase.ts exports
import { __mocks } from "../../../lib/supabase";
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockGt = __mocks.mockGt as ReturnType<typeof vi.fn>;

/**
 * TanStack Query's useQuery needs a QueryClientProvider ancestor to work
 * at all, even outside a real component tree. Fresh, isolated QueryClient
 * per test so cached data/query state never leaks between tests.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Shape returned by the mocked Supabase query — mirrors what a real
// `.select('id, lat, lng, area_label, expires_at, vendor_id, vendors(id, name)')`
// call against `checkins` returns once joined through the
// checkins_vendor_id_fkey relationship confirmed in database.ts.
const fakeActiveCheckinRow = {
  id: "checkin-1",
  lat: 45.523,
  lng: -122.676,
  area_label: "SE Division & 30th",
  expires_at: "2026-09-02T23:00:00.000Z",
  vendor_id: "vendor-1",
  vendors: { id: "vendor-1", name: "Pink Dog Carts" },
};

describe("useActiveVendorPins", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockGt.mockReset();
  });

  it("queries checkins for only-unexpired rows, joined to vendor id/name", async () => {
    mockGt.mockResolvedValueOnce({ data: [fakeActiveCheckinRow], error: null });

    const { result } = renderHook(() => useActiveVendorPins(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("checkins");
    // Confirms the lean column selection agreed for the initial fetch:
    // lat/lng/expires_at/vendor_id/area_label plus only vendor id+name,
    // not the full vendor profile (phone/website/logo/etc. are fetched
    // lazily on pin click, not in this list query).
    expect(mockGt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("returns the fetched active pins on success", async () => {
    mockGt.mockResolvedValueOnce({ data: [fakeActiveCheckinRow], error: null });

    const { result } = renderHook(() => useActiveVendorPins(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fakeActiveCheckinRow]);
  });

  it("returns an empty array (not undefined/null) when no vendors are currently active", async () => {
    mockGt.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useActiveVendorPins(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("surfaces a Supabase query error as a query error, not a silent empty result", async () => {
    mockGt.mockResolvedValueOnce({
      data: null,
      error: { message: "connection refused" },
    });

    const { result } = renderHook(() => useActiveVendorPins(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});