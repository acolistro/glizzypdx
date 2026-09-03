import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLastKnownVendorPins } from "./useLastKnownVendorPins";

// Mock the Supabase client module so we never make a real network call in
// tests. useLastKnownVendorPins builds a chained query:
//   supabase.from('checkins').select(...).eq('vendors.show_last_known', true).lte('expires_at', ...)
// — one link longer than useActiveVendorPins's chain (.gt only), since
// this query filters on both the joined vendors table AND expires_at.
// `.eq()` is chainable (returns an object exposing `.lte()`); `.lte()` is
// the terminal call that resolves with { data, error }, matching how
// supabase-js's real query builder resolves a promise at the end of a
// chain. Confirmed against real local Supabase via curl (see GLPDX-33
// ticket notes) before writing this mock, so the chain shape here matches
// what was proven to actually work against RLS, not a guess.
vi.mock("../../../lib/supabase", () => {
  const mockLte = vi.fn();
  const mockEq = vi.fn(() => ({ lte: mockLte }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return {
    supabase: {
      from: mockFrom,
    },
    __mocks: { mockFrom, mockSelect, mockEq, mockLte },
  };
});

// Importing the mocked module AFTER vi.mock so we get the mocked version.
// The `__mocks` export is a test-only escape hatch to reach the inner
// spies without re-deriving them from `supabase.from` on every test.
import { supabase } from "../../../lib/supabase";
// @ts-expect-error -- __mocks is a test-only addition to the mocked module, not part of the real supabase.ts exports
import { __mocks } from "../../../lib/supabase";
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockEq = __mocks.mockEq as ReturnType<typeof vi.fn>;
const mockLte = __mocks.mockLte as ReturnType<typeof vi.fn>;

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
// `.select('id, lat, lng, area_label, expires_at, vendor_id, vendors!inner(id, name, show_last_known)')`
// call against `checkins` returns, joined through the
// checkins_vendor_id_fkey relationship. Proven against real local
// Supabase (RLS policy "public can view last known checkin for opted-in
// vendors", GLPDX-12) before this test was written.
const fakeLastKnownCheckinRow = {
  id: "checkin-1",
  lat: 45.523,
  lng: -122.676,
  area_label: "SE Division & 30th",
  expires_at: "2026-09-01T18:00:00.000Z",
  vendor_id: "vendor-1",
  vendors: { id: "vendor-1", name: "Pink Dog Carts", show_last_known: true },
};

describe("useLastKnownVendorPins", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockEq.mockClear();
    mockLte.mockReset();
  });

  it("does not query at all when enabled is false — toggle-gated fetch, not client-side filtering", () => {
    renderHook(() => useLastKnownVendorPins(false), {
      wrapper: createWrapper(),
    });

    // No Supabase call should happen when the "show inactive" toggle is
    // off — this is the whole point of the toggle-gated (not client-side
    // filtered) architecture decision: no last-known location data should
    // even be requested from the server until the user asks for it.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries checkins joined to opted-in vendors, filtered to expired-or-current rows, when enabled is true", async () => {
    mockLte.mockResolvedValueOnce({ data: [fakeLastKnownCheckinRow], error: null });

    const { result } = renderHook(() => useLastKnownVendorPins(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("checkins");
    expect(mockEq).toHaveBeenCalledWith("vendors.show_last_known", true);
    expect(mockLte).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("returns the fetched last-known pins on success", async () => {
    mockLte.mockResolvedValueOnce({ data: [fakeLastKnownCheckinRow], error: null });

    const { result } = renderHook(() => useLastKnownVendorPins(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fakeLastKnownCheckinRow]);
  });

  it("returns an empty array when no vendors are opted into last-known display", async () => {
    mockLte.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useLastKnownVendorPins(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("surfaces a Supabase query error as a query error, not a silent empty result", async () => {
    mockLte.mockResolvedValueOnce({
      data: null,
      error: { message: "connection refused" },
    });

    const { result } = renderHook(() => useLastKnownVendorPins(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});