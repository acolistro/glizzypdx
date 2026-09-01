// src/config/env.test.ts
//
// GLPDX-181 (paired test ticket for GLPDX-7)
//
// What this tests: the `validateEnv()` function in `./validateEnv.ts`,
// which reads Vite's `import.meta.env` and returns a typed, validated
// object — or throws a clear error listing every missing required
// variable. Imports from `./validateEnv` rather than `./env` on purpose —
// `./env` eagerly calls this function and throws on import if a required
// var is missing, which would crash test collection before any
// `vi.stubEnv()` call in a test body ever runs. `./validateEnv` is the
// pure, side-effect-free version, safe to import statically here.
//
// Where the data comes from: we don't touch the real `import.meta.env` here.
// Vitest's `vi.stubEnv()` temporarily overwrites individual env var values
// for the duration of a test (and `vi.unstubAllEnvs()` in `afterEach` resets
// them), so each test controls exactly which vars are "present" without
// needing an actual `.env` file on disk.
//
// Where the results go: nowhere outside this file — these are pure unit
// tests asserting on the return value / thrown error of `validateEnv()`.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { validateEnv } from './validateEnv';

describe('validateEnv (GLPDX-7)', () => {
  // Vitest note: vi.stubEnv patches both process.env and import.meta.env
  // for Vite-loaded env vars. Always unstub after each test so one test's
  // stubbed values can't leak into the next.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a typed env object when all required vars are present', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');

    const result = validateEnv(import.meta.env);

    expect(result.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(result.supabasePublishableKey).toBe('test-publishable-key');
    expect(result.turnstileSiteKey).toBe('1x00000000000000000000AA');
  });

  it('leaves optional Stadia/Analytics vars undefined when unset — they are not required (GLPDX-23 not started, analytics provider undecided)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubEnv('VITE_STADIA_MAPS_API_KEY', undefined);
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', undefined);

    const result = validateEnv(import.meta.env);

    expect(result.stadiaMapsApiKey).toBeUndefined();
    expect(result.analyticsDomain).toBeUndefined();
  });

  it('throws a single error listing every missing required var, not just the first', () => {
    vi.stubEnv('VITE_SUPABASE_URL', undefined);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined);
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);

    // Regex checks all three names appear in the thrown message, in any
    // order relative to other text, across the whole (possibly multi-line)
    // message — the 's' flag lets '.' match newlines.
    expect(() => validateEnv(import.meta.env)).toThrowError(
      /VITE_SUPABASE_URL.*VITE_SUPABASE_PUBLISHABLE_KEY.*VITE_TURNSTILE_SITE_KEY/s
    );
  });

  it('throws when only one required var is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);

    expect(() => validateEnv(import.meta.env)).toThrow('VITE_TURNSTILE_SITE_KEY');
  });
});