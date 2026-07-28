import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Checks whether the current visitor has an active session AND that
// session's user has the admin role. Used by TanStack Router's
// `beforeLoad` on the /admin route (GLPDX-83) to decide whether to let
// the visitor through or redirect them away (GLPDX-85).
//
// Deliberately NOT a React hook. `beforeLoad` runs as part of the
// router's route-matching process, before any component renders — there
// is no component tree yet for a hook to attach to, so `useState`,
// `useEffect`, or any custom hook would simply fail to work here. This
// is a plain async function instead, callable from anywhere (a route
// definition, a test file, another utility) with no React involved.
//
// Where its data comes from: Supabase's local, cached auth session via
// `supabase.auth.getSession()`. This does NOT make a network request in
// the common case — supabase-js keeps the current session in memory
// (and persisted to storage) after login, so this call is fast and safe
// to run on every route navigation.
//
// Where its output goes: the caller (currently: the /admin route's
// `beforeLoad`) uses `isAdmin` to decide whether to continue rendering
// or throw a `redirect()`. `session` is returned too in case a future
// caller needs more than just the yes/no role check (e.g. displaying
// the logged-in admin's email).
// -----------------------------------------------------------------------

/**
 * The shape returned by getAdminSession(). Kept intentionally small —
 * just enough for a route guard to make its decision, not a general
 * "everything about the user" object.
 */
export interface AdminSessionResult {
  /** The current Supabase session, or null if nobody is logged in. */
  session: Session | null;
  /**
   * True only when there IS a session AND that session's user has
   * `app_metadata.role === "admin"`. False for: no session, a session
   * belonging to a non-admin (e.g. a future vendor account), or any
   * error encountered while checking.
   */
  isAdmin: boolean;
}

export async function getAdminSession(): Promise<AdminSessionResult> {
  // `supabase.auth.getSession()` never throws on its own — errors come
  // back as the `error` field alongside `data`, not as a rejected
  // promise. We still treat any non-null error as "not admin" (see the
  // fail-closed comment below) rather than assuming success.
  const { data, error } = await supabase.auth.getSession();

  // SECURITY: fail closed. If Supabase couldn't confirm there's a valid
  // session (network error, expired/invalid token, etc.), we must never
  // default to treating that as "admin access granted" just because we
  // don't have proof otherwise. Access requires a POSITIVE confirmation
  // of the admin role, not merely the absence of a definitive "no."
  if (error) {
    return { session: null, isAdmin: false };
  }

  const session = data.session;

  // No session at all — visitor isn't logged in. Not an admin.
  if (!session) {
    return { session: null, isAdmin: false };
  }

  // `app_metadata` is server-side-controlled (only writable via the
  // Supabase Admin API, never by the client itself — see GLPDX-84's
  // reasoning for why `app_metadata` was chosen over the client-writable
  // `user_metadata`). Reading `role` from here is safe: a vendor account
  // can't forge this value into "admin" from the browser.
  const role = session.user.app_metadata?.role;
  const isAdmin = role === "admin";

  return { session, isAdmin };
}