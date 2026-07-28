import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "@supabase/supabase-js";

// -----------------------------------------------------------------------
// WHAT THIS FILE TESTS
// -----------------------------------------------------------------------
// `getAdminSession()` is a plain (non-hook) async function used by
// TanStack Router's `beforeLoad` to decide whether the current visitor
// is allowed to reach any /admin route (GLPDX-83/85). It is NOT a React
// hook — `beforeLoad` runs outside the component tree, before anything
// renders, so it cannot call `useState`/`useEffect`/custom hooks. This
// function has to be callable directly, with no React involved at all.
//
// Because it's plain async code with no component to render, we test it
// the same way we'd test any other pure-ish function: mock its one
// dependency (the shared Supabase client's `auth.getSession()` call),
// call the function, and assert on what comes back.
//
// This test file is written BEFORE `getAdminSession.ts` exists — per the
// project's TDD rule, this should fail (red) first. The import below
// will fail to resolve until the implementation file is created.
// -----------------------------------------------------------------------

// `vi.mock` replaces the real `src/lib/supabase.ts` module for this test
// file only. We don't want a real network call to Supabase in a unit
// test — we want full control over what `auth.getSession()` returns so
// we can test each branch (admin, non-admin, logged out, error)
// deliberately, without depending on any real backend state.
//
// The path here MUST match the real relative path from THIS file's
// location (src/features/admin/lib/) to the real module
// (src/lib/supabase.ts): three levels up, then into lib/supabase.
vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      // `getSession` starts as an empty mock function. Each test below
      // configures its own return value via `.mockResolvedValueOnce(...)`
      // rather than sharing one global behavior across tests.
      getSession: vi.fn(),
    },
  },
}));

// Import AFTER the mock is set up, so the mocked version is what actually
// gets wired into `getAdminSession.ts` when it imports `{ supabase }`.
import { supabase } from "../../../lib/supabase";
import { getAdminSession } from "./getAdminSession";

// A minimal fake Session object. Supabase's real `Session` type has many
// more fields (access_token, refresh_token, expires_at, etc.) but our
// function only cares about `user.app_metadata.role`, so the rest is
// stubbed with harmless placeholder values just to satisfy TypeScript.
function makeFakeSession(role: string | undefined): Session {
  return {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "fake-user-id",
      app_metadata: role === undefined ? {} : { role },
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  } as unknown as Session;
}

describe("getAdminSession", () => {
  // Reset mock call history between tests so one test's configured
  // return value can't leak into the next test and produce a false pass.
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockReset();
  });

  it("returns isAdmin: true and the session when the logged-in user has role 'admin'", async () => {
    const adminSession = makeFakeSession("admin");

    // Simulate what the real Supabase client returns: an object with
    // `data.session` and `error` (null when the call succeeds).
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: adminSession },
      error: null,
    });

    const result = await getAdminSession();

    expect(result.isAdmin).toBe(true);
    expect(result.session).toEqual(adminSession);
  });

  it("returns isAdmin: false when a session exists but the role is not 'admin' (e.g. a vendor account)", async () => {
    const vendorSession = makeFakeSession("vendor");

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: vendorSession },
      error: null,
    });

    const result = await getAdminSession();

    expect(result.isAdmin).toBe(false);
  });

  it("returns isAdmin: false and session: null when nobody is logged in", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const result = await getAdminSession();

    expect(result.isAdmin).toBe(false);
    expect(result.session).toBeNull();
  });

  it("fails CLOSED (isAdmin: false) if Supabase returns an error, rather than assuming access", async () => {
    // This is a security-critical branch: if `getSession()` itself
    // errors out (network issue, expired token, etc.), we must NEVER
    // default to treating the visitor as an admin just because we
    // couldn't prove otherwise. Fail closed, not open.
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: { name: "AuthError", message: "network error" } as never,
    });

    const result = await getAdminSession();

    expect(result.isAdmin).toBe(false);
  });
});