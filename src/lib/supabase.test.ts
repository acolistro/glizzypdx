// src/lib/supabase.test.ts
//
// WHAT THIS FILE DOES: Tests supabase.ts's one real piece of logic — the
// guard clause that throws if VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY
// are missing at module-load time. Everything else in supabase.ts is a
// single createClient() call with no branching, so this guard is the only
// thing worth asserting against.
//
// WHERE ITS DATA COMES FROM: vi.stubEnv(), Vitest's built-in way to
// override import.meta.env values for the duration of a test — this
// stands in for what would normally come from your real .env file.
//
// WHERE ITS DATA GOES: nothing external. supabase.ts's guard clause never
// makes a network call — createClient() just builds a client object
// locally, it doesn't verify the URL/key are *valid* over the network,
// only that they're *present*. That's why these tests can run instantly
// with fake values instead of needing a real Supabase project.
//
// NON-OBVIOUS PATTERN: supabase.ts's throw happens the moment the module
// is imported (it's top-level code, not inside a function), not when some
// exported function is called. Vitest caches modules after the first
// import, so re-importing normally just returns the cached (already
// thrown-or-not) result — not a fresh evaluation. `vi.resetModules()`
// before each test clears that cache, and `await import(...)` (rather
// than a static top-of-file import) is what lets each test control
// exactly which env values are in place *before* the module's top-level
// code runs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("supabase client initialization", () => {
  beforeEach(() => {
    // Clear Vitest's module cache before every test so each dynamic
    // import() below re-runs supabase.ts's top-level guard clause fresh,
    // rather than reusing whatever the previous test's import produced.
    vi.resetModules();
  });

  afterEach(() => {
    // Restore real env values so stubs from one test never leak into
    // the next test file that happens to run after this one.
    vi.unstubAllEnvs();
  });

  it("creates a client without throwing when both env vars are present", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "fake-anon-key-for-testing");

    const { supabase } = await import("./supabase");

    // Not asserting deep internals of the Supabase SDK's client object —
    // just confirming a real client was constructed (it has an `auth`
    // property, which every supabase-js client exposes) rather than the
    // module throwing.
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it("throws a clear error when VITE_SUPABASE_URL is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "fake-anon-key-for-testing");

    // The throw happens during module evaluation, so importing itself is
    // the operation that can reject — that's why we assert against the
    // import() call rather than calling some function afterward.
    await expect(import("./supabase")).rejects.toThrow(
      /Missing Supabase environment variables/,
    );
  });

  it("throws a clear error when VITE_SUPABASE_PUBLISHABLE_KEY is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(import("./supabase")).rejects.toThrow(
      /Missing Supabase environment variables/,
    );
  });
});