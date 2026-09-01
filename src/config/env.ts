// src/config/env.ts
//
// GLPDX-7 — the app's single entry point for validated env vars.
//
// What this does: imports the pure `validateEnv()` logic from
// `./validateEnv` and calls it eagerly, right here at module load time,
// exporting the result as `env`.
//
// Where its data comes from: Vite's `import.meta.env`, populated at build
// time from whichever `.env*` file Vite loaded for the current mode — see
// README > Environment variables, and .env.example / .env.test.example /
// supabase/functions/.env.example for the different files used in
// different contexts (local dev, E2E builds, Edge Functions).
//
// Where its output goes: any module that needs a validated env var
// imports `{ env }` from this file, e.g.
//   import { env } from '../config/env';
//   const client = createClient(env.supabaseUrl, env.supabasePublishableKey);
//
// Why this file is separate from validateEnv.ts: this file has a
// *side effect* (it throws on import if a required var is missing).
// validateEnv.ts has none — it's a pure function. Keeping the side effect
// isolated here means validateEnv.ts stays freely importable in tests
// (see src/config/env.test.ts) without accidentally triggering a crash
// during test collection based on whatever real env vars happen to be set
// in the shell running the tests.
//
// Why fail-fast at import time, not lazy getters (GLPDX-7 decision): a
// missing required var should be a loud, immediate failure the moment the
// app boots — not a runtime surprise the first time some deep component
// happens to read it.

import { validateEnv } from './validateEnv';

// Eager validation at import time (fail-fast, per GLPDX-7 decision). Any
// module that does `import { env } from './env'` triggers this the moment
// it's imported — if a required var is missing, the app throws right here,
// before any component ever renders.
export const env = validateEnv();