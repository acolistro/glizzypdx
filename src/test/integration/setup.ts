/**
 * Integration-test setup (GLPDX-162). Runs ONCE before the integration test files, wired via
 * `setupFiles` in vitest.integration.config.ts.
 *
 * Responsibilities:
 *   1. Load the integration secrets from `.env.test.local` into process.env.
 *   2. Validate that everything the client factories need is present, failing with a clear,
 *      actionable message if not — so a missing `supabase start` or an un-populated env file is
 *      obvious immediately, instead of surfacing as a cryptic connection error inside a test.
 *
 * Where the values come from: `.env.test.local` (gitignored). You populate it from the running
 * local stack — see `.env.test.local.example`. These are plain, NON-`VITE_` names on purpose:
 * Vite inlines `VITE_`-prefixed vars into the browser bundle at build time, so the service_role
 * key must never wear that prefix.
 */

// Node 22+ (we're on Node 24 via .nvmrc) can load a dotenv-style file with no extra dependency.
// This reads the file and assigns its keys onto process.env.
// If the file is absent (e.g. CI, which injects these vars another way), we ignore the error
// and let the validation below decide whether anything is actually missing.
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // No local env file present — fine, as long as the vars are already in the environment.
}

// The exact keys the client factories (clients.ts) read. Keep this list in sync with them.
const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
  // Throwing here aborts the whole integration run before any test executes, with a message
  // that says exactly how to fix it — far friendlier than a timeout deep inside a test.
  throw new Error(
    [
      `Integration tests are missing required env vars: ${missing.join(", ")}.`,
      "",
      "Fix: ensure the local stack is running (`supabase start`), then populate",
      "`.env.test.local` from it. See `.env.test.local.example` for the exact commands.",
    ].join("\n"),
  );
}