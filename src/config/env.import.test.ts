// src/config/env.import.test.ts
//
// GLPDX-181 (paired test ticket for GLPDX-7)
//
// What this tests: the "fail fast at import" behavior of `./env.ts` — the
// module itself calls `validateEnv()` at the top level and exports the
// result as `env`, so importing the module should throw immediately if a
// required var is missing, before any component ever runs.
//
// Why this is a SEPARATE file from env.test.ts: testing "does importing the
// module throw" requires a fresh module evaluation per test. Vitest caches
// modules after first import, so we use `vi.resetModules()` + a dynamic
// `import()` inside each test to force re-evaluation with different stubbed
// env vars. Mixing this pattern into env.test.ts (which imports `validateEnv`
// normally, once, at the top of the file) would make module state harder to
// reason about, so it's kept isolated here.
//
// Where the data comes from / goes: same as env.test.ts — vi.stubEnv()
// controls the inputs; we assert on whether the dynamic import resolves or
// rejects.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env module import-time validation (GLPDX-7)', () => {
  beforeEach(() => {
    // Forces the next `import('./env')` to re-run the module's top-level
    // code (including the eager `validateEnv()` call) instead of returning
    // a cached module from a previous test.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws immediately on import when a required var is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', undefined);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');

    await expect(import('./env')).rejects.toThrow('VITE_SUPABASE_URL');
  });

  it('does not throw on import when all required vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');

    await expect(import('./env')).resolves.toBeDefined();
  });
});