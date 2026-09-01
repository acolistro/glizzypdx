import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Shared admin-role check for the three GLPDX-130 admin Edge Functions
// (admin-list-inquiries, admin-approve-inquiry, admin-reject-inquiry).
// Each of those functions runs with Supabase's default `verify_jwt`
// gateway setting ON, so by the time this code runs we already know the
// caller presented SOME validly-signed session token. What we still have
// to decide ourselves is whether that session belongs to an admin.
//
// Where its data comes from: the bearer token pulled off the incoming
// request's `Authorization` header by the caller (an index.ts handler),
// plus an injected Supabase client used to independently re-verify that
// token against the live Auth server via `auth.getUser(token)`.
//
// Where its output goes: the caller (each function's index.ts) uses
// `isAdmin` to decide whether to proceed or return 403, matching the
// same fail-closed contract as the client-side getAdminSession() (see
// src/features/admin/lib/getAdminSession.ts) that this function mirrors
// on the server.
//
// Non-obvious pattern: we deliberately call `auth.getUser(token)` — a
// real network round-trip to Supabase Auth — rather than locally
// base64-decoding the JWT payload. A local decode would only be safe
// because the gateway's `verify_jwt` setting already checked the
// signature upstream; if a function is ever redeployed with
// `--no-verify-jwt` (as handle-vendor-invite intentionally is, for its
// own separate reasons), a local decode would silently start trusting
// an unverified, forgeable payload. Calling the real Auth API removes
// that dependency on gateway configuration staying a certain way.
// -----------------------------------------------------------------------

export interface RequireAdminResult {
  /** True only when the token belongs to a live session with app_metadata.role === "admin". */
  isAdmin: boolean;
  /** The authenticated user's id when isAdmin is true, otherwise null. */
  userId: string | null;
}

const NOT_ADMIN: RequireAdminResult = { isAdmin: false, userId: null };

export async function requireAdmin(
  token: string | null,
  deps: { supabase: SupabaseClient },
): Promise<RequireAdminResult> {
  if (!token) {
    return NOT_ADMIN;
  }

  const { data, error } = await deps.supabase.auth.getUser(token);

  if (error || !data.user) {
    return NOT_ADMIN;
  }

  const role = data.user.app_metadata?.role;

  if (role !== "admin") {
    return NOT_ADMIN;
  }

  return { isAdmin: true, userId: data.user.id };
}