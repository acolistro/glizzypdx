// src/features/vendor-map/lib/stadiaStyle.ts
//
// GLPDX-23 — builds Stadia Maps style URLs for use as a MapLibre style
// (i.e. the `style` field passed to maplibregl.Map / this app's <Map>
// component's `options` prop — see ../components/Map.tsx).
//
// Where its data comes from: a style id (e.g. 'alidade_smooth') and an
// optional API key, passed in by the caller. In practice, the caller will
// be GLPDX-21 (Portland metro map UI), reading the key from
// `env.stadiaMapsApiKey` (src/config/env.ts).
//
// Where its output goes: a URL string, passed as `options.style` to the
// <Map> component.
//
// Key decision (see GLPDX-23's Jira description for full reasoning):
// the API key is OPTIONAL, not required. Stadia Maps' own docs state
// that localhost/127.0.0.1 development works without any key at all —
// only non-local/production deployments need one. So this builder omits
// the `?api_key=` query param entirely when no key is supplied, rather
// than treating that as an error. This intentionally differs from
// src/config/env.ts's fail-fast philosophy (GLPDX-7) — that pattern is
// right for vars the app can't function without at all (e.g. Supabase
// URL); it would be wrong here, since Stadia explicitly supports a
// legitimate no-key mode for local dev.

/**
 * Stadia's default general-purpose vector basemap style, used in their
 * own quickstart documentation. Swappable later — see Stadia's style
 * library at https://docs.stadiamaps.com/themes/ for alternatives.
 */
export const DEFAULT_STADIA_STYLE_ID = 'alidade_smooth';

/**
 * Builds a Stadia Maps style URL for the given style id.
 *
 * @param styleId - Which Stadia style to use, e.g. 'alidade_smooth'.
 * @param apiKey - Optional. Omit for keyless localhost development (see
 *   the module-level comment above). Required for production use.
 */
export function getStadiaStyleUrl(styleId: string, apiKey?: string): string {
  // encodeURIComponent on both pieces: styleId is currently always a
  // hardcoded literal (see DEFAULT_STADIA_STYLE_ID), and Stadia API keys
  // are ordinarily plain alphanumeric strings — but encoding defensively
  // costs nothing and avoids a broken URL if either ever contains a
  // character that needs escaping.
  const base = `https://tiles.stadiamaps.com/styles/${encodeURIComponent(styleId)}.json`;

  return apiKey ? `${base}?api_key=${encodeURIComponent(apiKey)}` : base;
}

/**
 * Convenience wrapper around getStadiaStyleUrl using this app's chosen
 * default style (DEFAULT_STADIA_STYLE_ID), so callers that just want
 * "the" Stadia style don't need to know or repeat the specific style id.
 *
 * @param apiKey - Optional, same rules as getStadiaStyleUrl.
 */
export function getDefaultStadiaStyleUrl(apiKey?: string): string {
  return getStadiaStyleUrl(DEFAULT_STADIA_STYLE_ID, apiKey);
}