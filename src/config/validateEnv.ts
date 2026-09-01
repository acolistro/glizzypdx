// src/config/validateEnv.ts
//
// GLPDX-7 — pure validation logic for the app's required Vite env vars.
//
// Why this is a SEPARATE file from env.ts: this file exports only a pure
// function (no top-level side effects), so it's safe to import statically
// in tests. `env.ts` imports this function and calls it eagerly at import
// time (fail-fast) — if this logic lived directly in env.ts instead, any
// test file that statically imports from env.ts would trigger that eager
// call during test collection, before the test's own `vi.stubEnv()` calls
// ever run, using whatever real env vars happen to be set in the shell —
// which is not what a unit test should depend on.

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_TURNSTILE_SITE_KEY',
] as const;

export interface AppEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey: string;
  /** Not yet consumed by any code — GLPDX-23 (Stadia tile config) not started. */
  stadiaMapsApiKey: string | undefined;
  /** Not yet consumed by any code — analytics provider (Plausible/Umami) undecided. */
  analyticsDomain: string | undefined;
}

export function validateEnv(source: ImportMetaEnv = import.meta.env): AppEnv {
  const missing = REQUIRED_VARS.filter((key) => !source[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env (or the relevant .env.*.example file) ' +
        'and fill in real values — see README > Environment variables.'
    );
  }

  return {
    supabaseUrl: source.VITE_SUPABASE_URL,
    supabasePublishableKey: source.VITE_SUPABASE_PUBLISHABLE_KEY,
    turnstileSiteKey: source.VITE_TURNSTILE_SITE_KEY,
    stadiaMapsApiKey: source.VITE_STADIA_MAPS_API_KEY || undefined,
    analyticsDomain: source.VITE_ANALYTICS_DOMAIN || undefined,
  };
}