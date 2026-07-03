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
    // Scope Vitest to ONLY look inside src/ for test files. Without this,
    // Vitest's default file matching also picks up e2e/*.spec.ts — but
    // those files import `test` from @playwright/test, not Vitest, which
    // causes a "did not expect test() to be called here" crash. The two
    // test runners need to stay in their own lanes: Vitest for src/,
    // Playwright for e2e/ (see playwright.config.ts's testDir).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

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