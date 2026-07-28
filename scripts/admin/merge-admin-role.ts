// scripts/admin/merge-admin-role.ts
//
// WHAT THIS FILE DOES: A single pure function, mergeAdminRole(), that
// takes a user's existing Supabase `app_metadata` object and returns a
// NEW object with `role: 'admin'` added in -- without touching any other
// keys that were already there. This is the one piece of GLPDX-84 with
// actual logic in it (see merge-admin-role.test.ts for why the rest of
// the script doesn't get unit tests).
//
// WHERE ITS DATA COMES FROM: called by set-admin-role.ts with whatever
// `app_metadata` object comes back from the Supabase admin SDK for the
// target user (from `listUsers()` -- see that file for why we can't use
// `getUserByEmail`, which doesn't exist in supabase-js's admin API).
//
// WHERE ITS DATA GOES: the return value is passed straight into
// `supabase.auth.admin.updateUserById(userId, { app_metadata: result })`.
// Whatever this function returns becomes the user's ENTIRE new
// app_metadata -- Supabase's updateUserById does a full replace of
// app_metadata, not a partial patch. That's exactly why this function
// exists: it does the "don't lose what was already there" merging on our
// side, before Supabase ever sees the request.
//
// NON-OBVIOUS PATTERN: this function deliberately returns a brand-new
// object (via the `...` spread) instead of mutating `existing` in place.
// Coming from Kotlin, this is similar to why you'd prefer a `copy()` on a
// data class over mutating a `var` property directly -- the caller's
// original reference stays untouched and predictable, which matters here
// because `existing` is a live object handed to us by the Supabase SDK,
// not something we own.
export function mergeAdminRole(
  existing: Record<string, unknown> | undefined,
): Record<string, unknown> {
  // `existing ?? {}` handles both shapes Supabase can hand us for "no
  // metadata yet": an actual `undefined`, or an already-present-but-empty
  // `{}`. Spreading either one into a new object, then overwriting `role`
  // last, means any pre-existing `role` key is intentionally replaced
  // (see the "overwrites a pre-existing role key" test) while every other
  // key survives untouched.
  return {
    ...(existing ?? {}),
    role: "admin",
  };
}