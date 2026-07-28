import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// WHAT THIS FILE TESTS
// -----------------------------------------------------------------------
// `requireAdminOrRedirect()` is the actual access-control decision behind
// GLPDX-83 (guard) and GLPDX-85 (silent redirect). It's deliberately
// separated from the route file itself (`src/routes/admin/route.tsx`)
// because TanStack Router's file-route objects are hard to unit test in
// isolation once `autoCodeSplitting` is on (see GLPDX-169's handoff notes
// for the five dead ends that led to that conclusion). Keeping this
// logic in its own plain async function means we can test the actual
// decision — "should this visitor be let through or redirected?" —
// without fighting the router's file-route machinery at all.
//
// `route.tsx` will just call this function from `beforeLoad` and stays
// thin/untested, the same way this project already treats Edge Function
// `index.ts` entry points as thin wrappers around tested business logic.
// -----------------------------------------------------------------------

// Mock the two things this function depends on:
// 1. getAdminSession() — so we control whether the "visitor" is an admin
//    without touching a real Supabase session.
// 2. redirect() from TanStack Router — so we can inspect exactly what
//    redirect target was thrown, without needing a real router/route
//    tree wired up (redirect() on its own has no router context
//    dependency, but mocking it keeps this test fully isolated from any
//    future change to TanStack Router's internal redirect object shape).
vi.mock("./getAdminSession", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  // The real `redirect()` returns a special object that `beforeLoad`
  // throws to trigger navigation. Our fake version just tags the object
  // so the test can assert on what it was called with.
  redirect: vi.fn((options: { to: string }) => ({
    isRedirect: true,
    ...options,
  })),
}));

import { redirect } from "@tanstack/react-router";
import { getAdminSession } from "./getAdminSession";
import { requireAdminOrRedirect } from "./requireAdminOrRedirect";

describe("requireAdminOrRedirect", () => {
  beforeEach(() => {
    vi.mocked(getAdminSession).mockReset();
    vi.mocked(redirect).mockClear();
  });

  it("resolves without throwing when the current session is an admin", async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      session: null, // session shape doesn't matter for this test, only isAdmin
      isAdmin: true,
    });

    // If this rejects/throws, the test fails automatically — no need for
    // a try/catch. This is the "let through" path: nothing should be
    // thrown, no redirect should be constructed.
    await expect(requireAdminOrRedirect()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("throws a redirect to the home page when the current session is NOT an admin", async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      session: null,
      isAdmin: false,
    });

    // GLPDX-85: redirect must be silent — no error message, no "access
    // denied" page, just sent to the home page as if /admin never
    // existed. Asserting the exact `to: "/"` target here, not just "it
    // throws something."
    await expect(requireAdminOrRedirect()).rejects.toMatchObject({
      isRedirect: true,
      to: "/",
    });
  });
});