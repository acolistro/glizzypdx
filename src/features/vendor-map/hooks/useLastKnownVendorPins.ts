// src/features/vendor-map/hooks/useLastKnownVendorPins.ts
//
// GLPDX-33 — data-fetching hook for the "last known" pin state on the
// public map: vendors who have opted into last-known display
// (`vendors.show_last_known = true`) and whose most recent checkin is
// being shown (whether it's still active or has expired — see below for
// why the "still active" overlap is deliberately excluded here even
// though RLS permits it).
//
// Where its data comes from: Supabase's `checkins` table, inner-joined to
// `vendors` (via the checkins_vendor_id_fkey relationship, confirmed in
// src/types/database.ts) and filtered to `vendors.show_last_known = true`.
// RLS (GLPDX-12) already restricts this to exactly ONE row per
// opted-in vendor — their single most recent checkin, via the
// `is_latest_checkin_for_vendor()` SECURITY DEFINER function baked into
// the RLS policy itself. That means this hook does NOT need to hand-roll
// "most recent checkin per vendor" logic (no DISTINCT ON, no lateral
// join) — the database is already doing that narrowing before this query
// ever runs. Confirmed against real local Supabase via curl before this
// hook was written (see GLPDX-33 ticket notes for the verification).
//
// Why this query still adds its own `.lte('expires_at', now)` filter:
// GLPDX-12's RLS policy comment explicitly notes that an opted-in
// vendor's most-recent checkin is visible via that policy whether it's
// STILL ACTIVE or expired — RLS doesn't care, because if it's still
// active, the separate "active checkins" policy already shows it anyway,
// and the two policies overlapping for an active checkin is harmless
// from an *access* perspective. But it's NOT harmless for THIS hook's
// purposes: useActiveVendorPins and this hook are meant to produce
// mutually exclusive result sets (a vendor should show as one pin, not
// two overlapping pins). The `.lte('expires_at', now)` filter here is
// what keeps that separation — it's a UI-correctness filter, not a
// privacy/security one (RLS already handles privacy).
//
// Toggle-gated, not client-side filtered (confirmed architecture
// decision): this hook takes `enabled` as a parameter and passes it
// straight through to TanStack Query's own `enabled` option, so the
// query genuinely does not execute — no request leaves the browser —
// until the caller passes `true`. This keeps the toggle-gating logic
// co-located with the query it's gating, rather than split across the
// hook and its caller.
//
// Where its output goes: consumed by whatever map component renders
// vendor pins (GLPDX-33's pin-rendering piece), to place last-known-state
// markers using the `--color-status-last-known` design token, each
// showing a "last active [timestamp]" label derived from `expires_at`.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

/**
 * The shape of one last-known vendor pin, as returned by the Supabase
 * query below. Same lean-column philosophy as ActiveVendorPin — only
 * what's needed to place a pin and show its "last active" timestamp.
 * Fuller vendor profile data is fetched lazily on pin click, same as the
 * active-pins hook.
 */
export interface LastKnownVendorPin {
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

/**
 * Fetches last-known vendor checkins for rendering as last-known-state
 * pins on the public map — vendors who have opted into last-known
 * display and whose most recent checkin has expired.
 *
 * @param enabled - Mirrors the "show inactive" toggle's state. When
 *   false, this hook's query does not execute at all (TanStack Query's
 *   `enabled: false`) — no last-known location data is requested from
 *   the server until the user actively turns the toggle on. This is the
 *   toggle-gated-fetch half of GLPDX-33's data-minimization decision.
 */
export function useLastKnownVendorPins(enabled: boolean) {
  return useQuery<LastKnownVendorPin[], Error>({
    queryKey: ["vendor-pins", "last-known"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select(
          "id, lat, lng, area_label, expires_at, vendor_id, vendors!inner(id, name, show_last_known)",
        )
        .eq("vendors.show_last_known", true)
        .lte("expires_at", new Date().toISOString());

      if (error) {
        throw error;
      }

      // See useActiveVendorPins.ts for the same reasoning: no `?? []`
      // fallback needed, since supabase-js only resolves with
      // `data: null` when `error` is also populated — the `if (error)
      // throw` above already guarantees `data` is a real array here.
      //
      // The cast is needed because Supabase's embedded-resource joins
      // type as an array by default, even though
      // checkins_vendor_id_fkey guarantees exactly one vendor per
      // checkin.
      return data as unknown as LastKnownVendorPin[];
    },
    enabled,
    // Last-known data changes far less often than active checkins (it
    // only changes when a vendor's most-recent checkin changes, or their
    // show_last_known setting flips) — a much longer staleTime than
    // useActiveVendorPins's 30s is appropriate here.
    staleTime: 5 * 60 * 1000,
  });
}