// src/features/vendor-map/lib/mapTokenColors.ts
//
// GLPDX-33 — bridges the CSS custom-property design token layer
// (tokens.css, GLPDX-127) into contexts that can't resolve var(--foo)
// themselves, like MapLibre's style-spec paint properties.
//
// Where its data comes from: getComputedStyle(document.documentElement)
// — the same mechanism the browser itself uses to resolve a CSS
// variable's value for real rendered elements. Reading it here means
// this function returns the SAME value tokens.css actually declares,
// with zero risk of drifting out of sync the way a hardcoded duplicate
// hex value could.
//
// Where its output goes: fed into MapLibre paint properties (e.g.
// 'circle-color') by VendorMapView, since MapLibre's style spec expects
// real color literals ("#2e7d32"), not CSS var() references.
//
// Non-obvious pattern: throws rather than returning an empty string
// for an undefined token. getPropertyValue() on a non-existent custom
// property returns "" instead of throwing — silently feeding that
// empty string into a MapLibre paint property would fail far away from
// the actual mistake (a missing/renamed token), inside MapLibre's own
// internals, with a confusing error. Failing loudly here, right at the
// point of the real problem, is far easier to debug.

export function readCssColorToken(tokenName: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim();

  if (!value) {
    throw new Error(
      `readCssColorToken: CSS custom property "${tokenName}" is not defined on :root. Check tokens.css for a typo or a removed token.`
    );
  }

  return value;
}