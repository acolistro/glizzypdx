/**
 * Supabase client factories for integration tests (GLPDX-162).
 *
 * Three roles, three trust levels — mirroring how the app is actually accessed:
 *   - service_role: full access, BYPASSES Row Level Security. Used ONLY in test setup to seed
 *     and tear down data (and to create/delete test users). It represents the backend/admin,
 *     never "a user". Do not use it to assert access-control behavior — it ignores the very
 *     policies under test.
 *   - anon: the public, unauthenticated role — what an anonymous visitor to the map gets. Use it
 *     to assert what the public can and cannot see/do.
 *   - authenticated: a signed-in vendor. We create a throwaway user via the admin API and sign
 *     in to obtain a real JWT, so RLS policies keyed off `auth.uid()` behave realistically.
 *
 * Where credentials come from: process.env, populated and validated by ./setup.ts from
 * `.env.test.local`. Deliberately NON-`VITE_` names so the service_role key can never leak into
 * a browser bundle.
 *
 * Where the clients go: imported by `*.integration.test.ts` files to arrange (seed) data and
 * assert against the local database.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

// Read once at module load. setup.ts has already validated these exist, so the non-null
// assertions (`!`) are safe.
const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// In Node tests we don't want the client persisting or auto-refreshing sessions to any storage —
// each test controls its own auth state explicitly.
const NON_PERSISTENT_AUTH = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/**
 * A service_role client. BYPASSES RLS. Use ONLY for test setup/teardown (seeding a vendor row,
 * creating/deleting test users) — never to assert access control, since it ignores policies.
 *
 * Returns: a SupabaseClient with god-mode DB access against the local stack.
 */
export function getServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, NON_PERSISTENT_AUTH);
}

/**
 * An anonymous (public) client, subject to RLS as the `anon` role. Use it to assert what an
 * unauthenticated visitor can/can't read or write.
 *
 * Returns: a SupabaseClient carrying no user session.
 */
export function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, NON_PERSISTENT_AUTH);
}

/**
 * The result of creating a throwaway authenticated user:
 *   - `client`: a Supabase client bound to that user's session (requests run as `authenticated`).
 *   - `user`:   the created auth user record (has `.id`, which is what RLS `auth.uid()` returns).
 *   - `cleanup`: deletes the user; call it in afterEach/afterAll so the local auth table doesn't
 *     accumulate test users across runs.
 */
export interface AuthedTestUser {
  client: SupabaseClient;
  user: User;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh authenticated user and return a client acting AS that user.
 *
 * How it works:
 *   1. Use the service_role admin API to create an already-confirmed user (no email round-trip).
 *   2. Sign that user in through an anon-key client to obtain a real access token (JWT).
 *   3. Return the session-bound client — its requests run as `authenticated` with `auth.uid()`
 *      set, so RLS policies see a real user.
 *
 * @param overrides optional email/password; defaults to a unique random email + password.
 * @returns an AuthedTestUser (client + user + cleanup).
 */
export async function createAuthedTestUser(
  overrides: { email?: string; password?: string } = {},
): Promise<AuthedTestUser> {
  // Unique per call so repeated/interleaved runs don't collide on the same address.
  const email = overrides.email ?? `it-${crypto.randomUUID()}@example.test`;
  const password = overrides.password ?? crypto.randomUUID();

  const admin = getServiceRoleClient();

  // 1. Create the user as already-confirmed so we can sign in immediately.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message ?? "unknown error"}`);
  }
  const user = created.user;

  // 2. Sign in via an anon-key client to mint a session (JWT) for this user.
  const client = getAnonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    // Best-effort cleanup so a failed sign-in doesn't leave an orphaned user behind.
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    throw new Error(`Failed to sign in test user: ${signInError.message}`);
  }

  // 3. Hand back the session-bound client plus a cleanup that removes the user.
  return {
    client,
    user,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
    },
  };
}