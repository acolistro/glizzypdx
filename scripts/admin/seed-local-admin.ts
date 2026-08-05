/**
 * scripts/admin/seed-local-admin.ts
 *
 * WHAT THIS DOES
 * Creates (or updates) a local-only admin test account in the Supabase
 * Auth instance running in your local Docker stack, so Playwright E2E
 * tests (GLPDX-124) have a real admin account to log in with.
 *
 * This is a companion to `scripts/admin/set-admin-role.ts`, not a
 * replacement or extension of it. That script targets PRODUCTION only
 * and promotes an EXISTING account to admin. This script is LOCAL only
 * and creates the account from scratch if it doesn't exist yet. They
 * are kept as two separate files on purpose (see chat discussion,
 * 2026-08-01): a shared script with an environment flag was the other
 * option, but it introduces a real footgun -- someone (or a future you,
 * six months from now, in a hurry) forgetting the flag and pointing a
 * local-seed command at production. Two files means the only way to
 * touch production is to run the production-only file, which has no
 * "local mode" to forget to pass.
 *
 * SAFETY: this script hard-refuses to run against anything that isn't
 * an obviously-local Supabase URL. That check exists specifically so a
 * misconfigured .env file (e.g. one that still has prod values in it
 * from testing something else) can't turn "seed my local admin" into
 * "create a surprise admin account in production."
 *
 * WHERE ITS DATA COMES FROM
 * - `LOCAL_SUPABASE_URL` / `LOCAL_SUPABASE_SECRET_KEY` env vars, read
 *   from `.env.local` (NOT plain `.env`). These names are deliberately
 *   distinct from `SUPABASE_URL` / `SUPABASE_SECRET_KEY` in `.env`,
 *   which this project's `set-admin-role.ts` (production-only) already
 *   uses. Discovered 2026-08-01: `.env` currently holds PRODUCTION
 *   values under those names, so this script cannot safely share them
 *   -- two scripts wanting opposite environments from identical
 *   variable names in the same file is exactly the setup that lets
 *   "which script did I run last" silently decide which environment
 *   the next one hits. `.env.local` is a separate, gitignored file
 *   whose only purpose is holding this script's local-only values, so
 *   there's nothing to toggle and nothing to mix up.
 * - Optional `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD` env vars, so
 *   you can override the test account's credentials without editing
 *   this file. Sensible local-only defaults are used if you don't set
 *   them.
 *
 * WHERE ITS OUTPUT GOES
 * - Writes a user into the local Supabase Auth instance (the same one
 *   `supabase start` spins up in Docker), with `app_metadata.role`
 *   set to `"admin"`.
 * - Prints a summary to the console. Nothing is written back to this
 *   repo -- rerunning `supabase db reset` wipes the account and you
 *   just rerun this script.
 *
 * USAGE
 *   node --env-file=.env.local --import tsx scripts/admin/seed-local-admin.ts
 *
 * NON-OBVIOUS PATTERNS
 * - Uses the Supabase Admin API (`auth.admin.createUser` /
 *   `auth.admin.updateUserById`), which requires the secret/service-
 *   role key, NOT the anon key. This is intentional and safe here
 *   because it only ever runs against your local Docker instance, not
 *   a key with real-world reach.
 * - Idempotent by design: if the account already exists, we don't
 *   error out, we just make sure its role is set to "admin" and its
 *   password matches. This matters because you'll run this after every
 *   `supabase db reset` during E2E work, and a script that fails on
 *   the second run is more friction than a seed script should ever be.
 * - Entry-point guard at the bottom (same pattern as
 *   `set-admin-role.ts`): this file's logic only runs when executed
 *   directly, not if some other script were to import it. Prevents
 *   this real-side-effect script from firing accidentally if it's ever
 *   pulled into Vitest's coverage collection.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// Config -- pulled from env, with local-only fallback defaults.
// ---------------------------------------------------------------------

const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
const LOCAL_SUPABASE_SECRET_KEY = process.env.LOCAL_SUPABASE_SECRET_KEY;

// Local-only test credentials. Overridable via env, but the defaults
// are intentionally obviously-fake so nobody mistakes this for a real
// account if it ever shows up in a screenshot or log.
//
// Password must contain at least one lowercase, one uppercase, one
// digit, and one symbol -- Supabase's default password_requirements
// policy. Found the hard way (2026-08-01): auth.admin.createUser
// silently accepted a password missing the uppercase requirement, but
// auth.admin.updateUserById correctly rejected it on the very next
// run -- these two Admin API calls do not enforce the policy
// consistently in this project's local GoTrue version. If you change
// this default, keep all four character classes represented, and
// don't trust createUser succeeding as proof the password is valid.
const LOCAL_ADMIN_EMAIL =
  process.env.LOCAL_ADMIN_EMAIL ?? "local-admin@glizzypdx.test";
const LOCAL_ADMIN_PASSWORD =
  process.env.LOCAL_ADMIN_PASSWORD ?? "Local-Admin-Test-Password-123!";

/**
 * Guards against ever running this against anything that isn't a local
 * Supabase instance. `supabase start`'s default local API URL is
 * http://127.0.0.1:54321 (or http://localhost:54321) -- anything else
 * fails loudly here rather than silently doing the wrong thing.
 */
function assertLocalUrl(url: string | undefined): asserts url is string {
  if (!url) {
    throw new Error(
      "LOCAL_SUPABASE_URL is not set. Run this with `node --env-file=.env.local --import tsx scripts/admin/seed-local-admin.ts` " +
        "from a shell where your .env.local is present (see .env.local.example for the expected shape). " +
        "Deliberately NOT read from plain .env -- that file currently holds production values for set-admin-role.ts.",
    );
  }

  const isLocal =
    url.includes("127.0.0.1") || url.includes("localhost");

  if (!isLocal) {
    throw new Error(
      `Refusing to run: LOCAL_SUPABASE_URL ("${url}") does not look like a local Supabase instance. ` +
        "This script only ever creates accounts locally. If you meant to promote a production account to admin, " +
        "use scripts/admin/set-admin-role.ts instead.",
    );
  }
}

/**
 * Finds an existing user by email via the Admin API's list-users
 * endpoint. Supabase's Admin API doesn't expose a direct "get user by
 * email" call, so we page through listUsers and match manually. Local
 * dev instances have a tiny user count, so this is cheap in practice.
 */
async function findUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw new Error(`Failed to list users while checking for an existing account: ${error.message}`);
  }

  return data.users.find((user) => user.email === email) ?? null;
}

async function seedLocalAdmin() {
  assertLocalUrl(LOCAL_SUPABASE_URL);

  if (!LOCAL_SUPABASE_SECRET_KEY) {
    throw new Error(
      "LOCAL_SUPABASE_SECRET_KEY is not set. Run `supabase status -o json` " +
        "against your local instance, grab the secret/service-role key from the output, " +
        "and put it in .env.local as LOCAL_SUPABASE_SECRET_KEY.",
    );
  }

  // Admin client: uses the secret key, bypasses RLS and Auth's normal
  // signup restrictions (including `auth.email.enable_signup = false`,
  // which is correct -- this script IS the local equivalent of an
  // admin invite, not a public signup).
  const supabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const existingUser = await findUserByEmail(supabase, LOCAL_ADMIN_EMAIL);

  if (existingUser) {
    // Account already exists (e.g. from a previous run before a
    // `supabase db reset` that didn't actually wipe Auth, or a rerun
    // in the same session). Make sure it's still in the state E2E
    // tests expect rather than erroring out.
    const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: LOCAL_ADMIN_PASSWORD,
      app_metadata: { role: "admin" },
    });

    if (error) {
      throw new Error(`Found existing local admin account but failed to update it: ${error.message}`);
    }

    console.log(`Updated existing local admin account: ${LOCAL_ADMIN_EMAIL}`);
    return;
  }

  // No existing account -- create one fresh. `email_confirm: true`
  // skips the confirmation-email step entirely, which is correct for
  // a local test fixture (there's no real inbox to confirm from, and
  // GLPDX-124's E2E tests need to log in immediately, not wait on a
  // confirmation flow that's out of scope for this ticket).
  const { error } = await supabase.auth.admin.createUser({
    email: LOCAL_ADMIN_EMAIL,
    password: LOCAL_ADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });

  if (error) {
    throw new Error(`Failed to create local admin account: ${error.message}`);
  }

  console.log(`Created local admin account: ${LOCAL_ADMIN_EMAIL}`);
}

// ---------------------------------------------------------------------
// Entry-point guard.
//
// This checks whether the file was invoked directly (e.g. via
// `node --env-file=.env --import tsx scripts/admin/seed-local-admin.ts`)
// versus imported by something else, like Vitest's coverage collector
// crawling the scripts/ directory. Without this guard, a real
// side-effecting script like this one could fire unintentionally
// during a test run. Same pattern this project already established
// for set-admin-role.ts (GLPDX-84/169).
// ---------------------------------------------------------------------
if (process.argv[1] === new URL(import.meta.url).pathname) {
  seedLocalAdmin()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}