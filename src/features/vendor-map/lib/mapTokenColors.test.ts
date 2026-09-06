// src/features/vendor-map/lib/mapTokenColors.test.ts
//
// GLPDX-33 — readCssColorToken() bridges the CSS custom-property design
// token layer (tokens.css, GLPDX-127) into MapLibre's style-spec paint
// properties, which need real color literals (e.g. "#2e7d32") and
// cannot resolve var(--token-name) themselves the way real CSS can.
//
// Where its data comes from: the browser's own computed-style system.
// getComputedStyle(document.documentElement) is exactly what the
// browser uses to resolve var(--foo) for real CSS — this function reads
// that same resolved value directly, rather than re-implementing CSS
// variable resolution by hand or (worse) hardcoding a duplicate hex
// value here that could drift out of sync with tokens.css.
//
// Where its output goes: fed straight into a MapLibre layer's paint
// property (e.g. 'circle-color') by VendorMapView, GLPDX-33's next
// piece.
//
// Non-obvious pattern: this MUST read a real computed value, not
// hardcode a hex string as a shortcut — tokens.test.ts (GLPDX-170)
// actively scans every .tsx file in src/ for hardcoded hex colors and
// fails the build if one appears outside tokens.css itself. A hardcoded
// hex here would also silently drift from tokens.css if the design
// direction ever changes colors again (as it already has once, from
// GeoCities to Late 90s Primary Colors).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readCssColorToken } from "./mapTokenColors";

describe("readCssColorToken", () => {
  let styleElement: HTMLStyleElement;

  beforeEach(() => {
    // Real CSS custom properties, not a mock of getComputedStyle itself
    // — this proves the function reads genuinely resolved computed
    // values the same way the browser would, rather than testing
    // against a fake stand-in for that mechanism.
    styleElement = document.createElement("style");
    styleElement.textContent = ":root { --test-color: #2e7d32; }";
    document.head.appendChild(styleElement);
  });

  afterEach(() => {
    document.head.removeChild(styleElement);
  });

  it("returns the resolved value of a CSS custom property declared on :root", () => {
    expect(readCssColorToken("--test-color")).toBe("#2e7d32");
  });

  it("trims incidental whitespace from the computed value", () => {
    // getComputedStyle().getPropertyValue() commonly returns values with
    // a leading space (e.g. " #2e7d32") because of how browsers
    // serialize the declaration's value after the colon — this is
    // real, observed behavior, not a hypothetical edge case.
    styleElement.textContent = ":root { --test-color:   #2e7d32  ; }";
    expect(readCssColorToken("--test-color")).toBe("#2e7d32");
  });

  it("throws a clear error if the token is not defined, rather than silently returning an empty string", () => {
    // An empty string silently fed into a MapLibre paint property would
    // fail far away from the real cause (a missing/renamed token) with
    // a confusing MapLibre-internal error. Failing loudly here, at the
    // point of the actual mistake, is more useful for debugging.
    expect(() => readCssColorToken("--does-not-exist")).toThrow(
      /--does-not-exist/
    );
  });
});