// src/features/vendor-map/lib/stadiaStyle.test.ts
//
// GLPDX-183 (paired test ticket for GLPDX-23)
//
// What this tests: pure, no-DOM, no-maplibre-gl functions that build a
// Stadia Maps style URL. No mocking needed here (unlike Map.test.tsx /
// useMapLibre.test.tsx) — these are plain string-building functions with
// no side effects and no dependency on maplibre-gl or the DOM.
//
// Where the data comes from: function arguments passed directly in each
// test — a style id and an optional API key.
//
// Where the results go: nowhere outside this file. GLPDX-21 (Portland
// metro map UI) will later import getDefaultStadiaStyleUrl and pass its
// result as the Map component's `options.style`.
//
// Key decision this encodes (see GLPDX-23's Jira description): the API
// key is OPTIONAL. Confirmed via Stadia Maps' own docs that localhost/
// 127.0.0.1 development works without a key — only non-local deployments
// need one — so the URL builder omits `?api_key=` entirely when no key
// is provided, rather than treating a missing key as an error.

import { describe, it, expect } from 'vitest';
import { getStadiaStyleUrl, getDefaultStadiaStyleUrl, DEFAULT_STADIA_STYLE_ID } from './stadiaStyle';

describe('getStadiaStyleUrl (GLPDX-23)', () => {
  it('builds a keyless style URL when no API key is provided — Stadia allows this for localhost dev', () => {
    expect(getStadiaStyleUrl('alidade_smooth')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth.json'
    );
  });

  it('appends ?api_key= when an API key is provided', () => {
    expect(getStadiaStyleUrl('alidade_smooth', 'test-key-123')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=test-key-123'
    );
  });

  it('URL-encodes the API key, in case it ever contains characters that need escaping', () => {
    expect(getStadiaStyleUrl('alidade_smooth', 'has spaces&special=chars')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=has%20spaces%26special%3Dchars'
    );
  });

  it('works with different style ids, not just the default', () => {
    expect(getStadiaStyleUrl('alidade_smooth_dark')).toBe(
      'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
    );
  });
});

describe('getDefaultStadiaStyleUrl (GLPDX-23)', () => {
  it('uses DEFAULT_STADIA_STYLE_ID as the style id', () => {
    expect(getDefaultStadiaStyleUrl()).toBe(getStadiaStyleUrl(DEFAULT_STADIA_STYLE_ID));
  });

  it('passes the API key through to getStadiaStyleUrl', () => {
    expect(getDefaultStadiaStyleUrl('key-1')).toBe(
      getStadiaStyleUrl(DEFAULT_STADIA_STYLE_ID, 'key-1')
    );
  });
});