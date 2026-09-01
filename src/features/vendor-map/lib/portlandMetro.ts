// src/features/vendor-map/lib/portlandMetro.ts
//
// GLPDX-21 — geographic constants for centering the base map on the
// Portland metro area. Kept separate from PortlandMap.tsx (rather than
// inlined) so GLPDX-24 (default bounds) and GLPDX-25 (pan restriction),
// which are next in the chain, have an obvious home to add their own
// Portland-metro geographic constants (e.g. a bounding box) alongside
// this center point, instead of duplicating coordinates across files or
// reaching into a component file to reuse them.
//
// Where this data comes from: hardcoded real-world coordinates, not
// derived from any API or user input.
//
// Where this data goes: consumed by PortlandMap.tsx as the `center` and
// `zoom` passed into GLPDX-22's <Map> component's `options` prop.

/**
 * [longitude, latitude] of Pioneer Courthouse Square, downtown Portland —
 * "Portland's living room." Chosen as a recognizable, real landmark
 * (rather than an arbitrary computed metro centroid) so this coordinate
 * stays legible if it turns up in a code review, a failing test
 * assertion, or a debugging session.
 *
 * Order is [lng, lat] because that's the order MapLibre (and GeoJSON)
 * expect — the opposite of the more common [lat, lng] convention, so
 * this is called out explicitly to avoid a swapped-coordinate bug.
 *
 * This is a placeholder-quality default, not precision engineering — see
 * GLPDX-24 (default bounds) and GLPDX-25 (pan restriction), which are
 * separate tickets that will formalize the actual Portland-metro bounding
 * box. This constant only needs to be reasonable for GLPDX-21's scope
 * (initial map center), not authoritative for bounds enforcement.
 */
export const PORTLAND_METRO_CENTER: [number, number] = [-122.6765, 45.5188];

/**
 * Default initial zoom level when the map first loads.
 *
 * 12 shows greater downtown Portland plus a meaningful ring of inner
 * neighborhoods — close to where hotdog carts actually cluster — without
 * being so tight that panning to any real vendor location immediately
 * pushes the view off-screen. Zoom 13-14 would be too tight for a
 * metro-wide default; zoom 10 would be too zoomed out to be useful before
 * GLPDX-24's bounds are in place.
 */
export const PORTLAND_METRO_DEFAULT_ZOOM = 12;