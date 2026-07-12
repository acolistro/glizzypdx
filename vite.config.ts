import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// We import defineConfig from "vitest/config" instead of plain "vite" —
// it's the same function, but its TypeScript type is Vite's UserConfig
// extended with the `test` key (see the `test` block below). Importing
// from "vite" directly would make TypeScript reject `test` as an unknown
// property, since Vite itself has no concept of Vitest's config.
//
// Vite's config file. This controls how the dev server runs, how the
// production build is bundled, AND (via the `test` block below) how
// Vitest runs — Vitest reuses this same config so you don't maintain
// two separate setups for "run the app" vs "run the tests".
export default defineConfig({
  // The React plugin gives us JSX support and Fast Refresh (instant
  // in-browser updates when you save a file, without losing component state).
  plugins: [react()],

  resolve: {
    alias: {
      // Mirrors the "@/*" path alias declared in tsconfig.app.json.
      // Both need to point at the same place — TypeScript uses its copy
      // for type-checking in your editor, Vite uses this copy to actually
      // resolve the import at build/dev time.
      //
      // import.meta.dirname (not __dirname) because this file runs as
      // native ESM — package.json has "type": "module", and __dirname is
      // a CommonJS-only global that simply doesn't exist in ESM scope.
      // import.meta.dirname is Node's built-in ESM equivalent, available
      // since Node 20.11 (we're on Node 24, well past that floor).
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  test: {
    // Scope Vitest to look inside src/ AND the Edge Functions logic
    // modules under supabase/functions/. Still excludes anything importing
    // from @playwright/test (e2e/*.spec.ts) — that pattern doesn't match
    // either glob below, so Playwright and Vitest stay in their own lanes
    // as before.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
    ],

    // jsdom simulates a browser DOM inside Node, which is what lets
    // React Testing Library render components and query them in tests
    // without an actual browser window.
    environment: "jsdom",

    // Runs before every test file — see src/test/setup.ts. This is where
    // we extend Vitest's `expect` with jest-dom matchers like
    // `.toBeInTheDocument()`.
    setupFiles: "./src/test/setup.ts",

    // Lets you write `describe`, `it`, `expect` without importing them
    // in every single test file.
    globals: true,

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Per project rules: CI enforces a coverage threshold. Starting
      // conservative — raise these as the suite matures and the real
      // bar gets agreed on in Jira.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});