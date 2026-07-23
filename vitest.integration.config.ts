/**
 * Vitest configuration for INTEGRATION tests (GLPDX-162).
 *
 * Why a second, separate config (instead of adding to the unit-test config in vite.config.ts)?
 *  - Unit/component tests run in a jsdom environment, are hermetic, and must stay fast. They
 *    run on every save and in the quick CI lane via `pnpm test`.
 *  - Integration tests talk to a REAL Postgres — the local Supabase stack from `supabase start`
 *    (set up in GLPDX-109). They need a Node environment (no browser DOM), they're slower, and
 *    they must NOT run in the default `pnpm test` pass: a developer without Docker running would
 *    otherwise see confusing failures.
 *
 * Splitting configs is the cleanest separation: `pnpm test` = unit, `pnpm test:integration` =
 * these. A file opts in to being an integration test purely by its filename suffix.
 *
 * Data flow: integration test files import client factories from
 * ./src/test/integration/clients.ts, which connect to the local stack using credentials that
 * ./src/test/integration/setup.ts loads and validates before any test runs.
 *
 * (Coming from Kotlin/JUnit: think of this as a second Gradle test source set with its own
 * runner config — one for fast pure-JVM unit tests, one for tests that need a live database.)
 */
import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the "@/*" alias from vite.config.ts / tsconfig.app.json so integration tests
      // can import helpers as "@/test/integration/clients" like the rest of the codebase.
      // import.meta.dirname (not __dirname) because this file runs as native ESM.
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // Node, not jsdom: there is no browser here — just a Supabase client making network calls.
    environment: "node",

    // Match the unit suite so integration tests can use describe/it/expect without importing
    // them (vite.config.ts sets this too).
    globals: true,

    // Only pick up files that explicitly opt in with the `.integration.test.ts` suffix.
    include: ["**/*.integration.test.ts"],

    // Belt-and-suspenders: keep Vitest's default excludes (node_modules, dist, etc.) in force.
    exclude: [...configDefaults.exclude],

    // Runs once before the integration test files: loads env vars and fails fast with an
    // actionable message if the stack isn't reachable / secrets are missing.
    setupFiles: ["./src/test/integration/setup.ts"],

    // These tests share ONE database. Running test FILES in parallel would let them stomp on
    // each other's rows. Disable file-level parallelism so files run one at a time. (Tests
    // within a single file already run sequentially by default.)
    fileParallelism: false,

    // Integration tests legitimately take longer than a unit test (network + DB round trips,
    // user creation, etc.). Give them more headroom than the jsdom default.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});