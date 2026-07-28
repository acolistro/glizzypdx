// scripts/admin/merge-admin-role.test.ts
//
// WHAT THIS FILE DOES: Unit tests for mergeAdminRole(), the one piece of
// GLPDX-84 that actually has logic worth testing. Everything else in the
// admin-role script is a thin wrapper around the Supabase admin API (look
// up a user, call updateUserById) -- there's nothing to assert there
// beyond "did we call the SDK with the right arguments," which isn't
// meaningful to unit test. This function is different: it's the one spot
// where a bug could silently destroy data, by overwriting a user's
// existing app_metadata instead of adding to it.
//
// WHERE ITS DATA COMES FROM: nothing external -- these are plain function
// calls with hand-written input objects, no Supabase client, no network.
// That's what makes this genuinely unit-testable without mocking.
//
// WHERE ITS DATA GOES: test runner output only (pass/fail). This file is
// never imported by the script itself; it only exercises it.
//
// TDD NOTE (per project rules): this test is written FIRST and is
// expected to fail right now, because merge-admin-role.ts doesn't exist
// yet. Run `pnpm vitest run scripts/admin/merge-admin-role.test.ts` and
// paste the failure output back before the implementation gets written.
import { describe, it, expect } from "vitest";
import { mergeAdminRole } from "./merge-admin-role";

describe("mergeAdminRole", () => {
  it("adds an admin role to a user with no existing app_metadata", () => {
    // Simulates the most common real case for GLPDX-84: Alyssa's account
    // was created via normal signup/invite and has never had app_metadata
    // touched before. `undefined` is what the Supabase admin SDK's
    // `getUserById`/`listUsers` response shape gives you for a user whose
    // app_metadata was never set to anything.
    const result = mergeAdminRole(undefined);
    expect(result).toEqual({ role: "admin" });
  });

  it("adds an admin role to a user with an empty app_metadata object", () => {
    // Supabase can also represent "nothing set" as `{}` rather than
    // `undefined`, depending on how the row was created. Both must behave
    // identically -- this test exists so a future refactor can't
    // accidentally special-case one but not the other.
    const result = mergeAdminRole({});
    expect(result).toEqual({ role: "admin" });
  });

  it("preserves existing app_metadata keys instead of overwriting them", () => {
    // This is the actual bug this function exists to prevent. If Alyssa's
    // account already has other app_metadata (e.g. something set by a
    // future auth hook, or a provider field Supabase itself writes), a
    // naive `{ role: 'admin' }` assignment would silently wipe it out.
    const existing = { provider: "email", providers: ["email"] };
    const result = mergeAdminRole(existing);
    expect(result).toEqual({
      provider: "email",
      providers: ["email"],
      role: "admin",
    });
  });

  it("overwrites a pre-existing role key rather than leaving it stale", () => {
    // If this script is ever re-run (e.g. after accidentally being reset,
    // or reused for a second admin account later per GLPDX-84's CLI-arg
    // design), it should be idempotent and always end up with role:
    // 'admin' -- not silently no-op because a role key already existed
    // with some other value.
    const existing = { role: "vendor" };
    const result = mergeAdminRole(existing);
    expect(result).toEqual({ role: "admin" });
  });

  it("does not mutate the input object", () => {
    // Defensive test for a common bug class: functions that merge objects
    // via direct mutation (`existing.role = 'admin'; return existing;`)
    // instead of returning a new object. Mutating the input is dangerous
    // here specifically because the caller passes in the user's *current*
    // metadata straight from the Supabase SDK response -- mutating it
    // could have surprising effects if that same object is read again
    // elsewhere before the updateUserById call completes.
    const existing = { provider: "email" };
    mergeAdminRole(existing);
    expect(existing).toEqual({ provider: "email" });
  });
});