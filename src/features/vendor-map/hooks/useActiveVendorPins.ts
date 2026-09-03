// src/features/vendor-map/hooks/useActiveVendorPins.ts
//
// GLPDX-33 — data-fetching hook for the "active" pin state on the public
// map: vendors who currently have an unexpired checkin. This is the
// simpler half of GLPDX-33's two-query design (see GLPDX-185's paired
// test file and the GLPDX-33 Jira description for the full active/
// last-known query-shape decision) — it always runs, unconditional on
// the "show inactive" toggle, unlike the last-known query which is
// toggle-gated.
//
// Where its data comes from: Supabase's `checkins` table, filtered to
// only rows whose `expires_at` is in the future, joined through the
// `checkins_vendor_id_fkey` relationship (confirmed in
// src/types/database.ts) to get each checkin's vendor's `id` and `name`.
// RLS (GLPDX-12) already restricts what's readable to approved vendors
// and active-or-opted-in-last-known checkins before this query ever
// runs — but RLS alone doesn't separate "active" from "last known" (it
// permits both), so the `.gt('expires_at', now)` filter here is what
// actually narrows this specific query down to only the active state.
//
// Deliberately lean column selection: only what's needed to place a pin
// on the map and label it minimally (position, expiry, area label, and
// the vendor's id/name). Fuller vendor profile data (phone, website,
// logo, allergen flags, etc.) is fetched lazily when a pin is clicked,
// not bundled into this list query — confirmed decision, data
// minimization over a marginally simpler single fetch.
//
// Where its output goes: consumed by whatever map component renders
// vendor pins (GLPDX-33's pin-rendering piece, built on top of this
// hook) to place active-state markers using the `--color-status-active`
// design token.
//
// Non-obvious pattern: TanStack Query's useQuery, not useMutation — this
// is the first read-hook (as opposed to the existing useVendorInquiry's
// write/mutation hook) in the project. `staleTime: 30_000` (30s) is
// deliberately short: because "active" is defined by `expires_at`, a
// cached "active" pin could become stale in a state-changing sense (a
// vendor's checkin actually expiring) well before TanStack Query would
// otherwise consider the cached data stale by default — a short
// staleTime keeps the map from showing a vendor as active past their
// real expiry.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

/**
 * The shape of one active vendor pin, as returned by the Supabase query
 * below. Hand-narrowed from the generated `checkins`/`vendors` Row types
 * (src/types/database.ts) down to only the columns this hook actually
 * selects — not the full generated Row type, since we intentionally
 * don't select every column (see the lazy-fetch note above).
 */
export interface ActiveVendorPin {
  id: string;
  lat: number;
  lng: number;
  area_label: string | null;
  expires_at: string;
  vendor_id: string;
  vendors: {
    id: string;
    name: string;
  };
}

/**
 * Fetches all currently-active vendor checkins (unexpired, on an
 * approved vendor per RLS) for rendering as active-state pins on the
 * public map.
 *
 * Always enabled — this query has no dependency on the "show inactive"
 * toggle, unlike the sibling last-known-pins hook, which only runs its
 * query once the toggle is on.
 */
export function useActiveVendorPins() {
  return useQuery<ActiveVendorPin[], Error>({
    queryKey: ["vendor-pins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("id, lat, lng, area_label, expires_at, vendor_id, vendors(id, name)")
        .gt("expires_at", new Date().toISOString());

            if (error) {
        throw error;
      }

      // No `?? []` fallback here: supabase-js only resolves with
      // `data: null` when `error` is also populated (never both null),
      // so the `if (error) throw` above already guarantees `data` is a
      // real array by this point. A defensive fallback for a case that
      // can't actually occur would just be an untested (and untestable
      // without faking an impossible response shape) branch.
      //
      // The cast is still needed because Supabase's embedded-resource
      // joins type as an array by default (a table can theoretically
      // join to many rows), even though checkins_vendor_id_fkey
      // guarantees exactly one vendor per checkin here.
      return data as unknown as ActiveVendorPin[];
    },
    staleTime: 30_000,
  });
}