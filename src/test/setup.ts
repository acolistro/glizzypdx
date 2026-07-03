import "@testing-library/jest-dom/vitest";

// This file runs once before EVERY test file (wired up via `setupFiles`
// in vite.config.ts's `test` block). Its only job is to extend Vitest's
// `expect` function with jest-dom's matchers — things like
// `expect(element).toBeInTheDocument()` or `.toHaveTextContent()`.
//
// Without this import, those matchers don't exist and every test would
// have to fall back to more awkward, less readable assertions like
// `expect(element).not.toBeNull()`.
//
// Nothing is exported from this file — it's pure side effect (the import
// itself does the work of extending `expect`).
