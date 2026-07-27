// scripts/admin/set-admin-role.ts
//
// WHAT THIS FILE DOES: GLPDX-84. A one-off, re-runnable CLI script that
// grants the admin role to a Supabase user by setting
// `app_metadata.role = 'admin'` on their account. Run it by hand -- it is
// NOT part of the deployed app, never runs in the browser, and is never
// invoked by any Edge Function, migration, or CI job.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/admin/set-admin-role.ts alyssa@example.com
//
// (Node 24's built-in --env-file flag is used instead of adding a
// `dotenv` dependency -- one less third-party package pulled into a repo
// with a "no unnecessary dependencies" privacy posture, and Node 24 LTS
// supports it natively.)
//
// WHERE ITS DATA COMES FROM:
//   - process.argv: the target user's email, passed as a CLI argument
//     (chosen over hardcoding so this script is reusable if a second
//     admin account is ever needed, without editing the file).
//   - process.env.SUPABASE_URL / SUPABASE_SECRET_KEY: read from your
//     local .env.local (gitignored). SUPABASE_SECRET_KEY is the *local*
//     env var name for this script specifically -- deliberately singular
//     and distinct from SUPABASE_SECRET_KEYS, which is the Supabase Edge
//     Runtime's own auto-injected variable used inside deployed Edge
//     Functions (see handle-vendor-invite/index.ts). This script runs on
//     your laptop, not inside that runtime, so nothing auto-injects it --
//     you must copy the value manually from Dashboard > Settings > API
//     Keys > the `default_2` secret key.
//   - Supabase's Admin Auth API (auth.admin.listUsers / updateUserById),
//     called with the secret key above, which grants service-role-level
//     access.
//
// WHERE ITS DATA GOES: production Supabase auth.users.raw_app_meta_data
// for the target user. This is a real write against production -- there
// is no local/Docker equivalent to run this against first, because its
// entire purpose is granting access on your actual account.
//
// WHY THIS FILE HAS NO UNIT TESTS: agreed with Alyssa during GLPDX-84 --
// everything below is a thin sequence of "call the Supabase SDK, check
// the result" steps with no independent logic to assert against. The one
// piece of real logic (merging app_metadata without clobbering existing
// keys) is extracted into mergeAdminRole(), which DOES have unit tests --
// see merge-admin-role.test.ts.
import { createClient } from "@supabase/supabase-js";
import { mergeAdminRole } from "./merge-admin-role";

/**
 * Entry point. Wrapped in an async function (rather than top-level
 * await) so the whole script can be wrapped in one try/catch below --
 * matches this project's "full error handling for all async operations"
 * rule, and means any unexpected failure prints a clear message instead
 * of a raw unhandled-rejection stack trace.
 */
async function main(): Promise<void> {
  // --- Read and validate the CLI argument ---
  // process.argv[0] is the node binary, [1] is this script's path, so the
  // first real argument is index 2.
  const targetEmail = process.argv[2];

  if (!targetEmail) {
    console.error(
      "Usage: node --env-file=.env.local --import tsx scripts/admin/set-admin-role.ts <email>",
    );
    process.exit(1);
  }

  // --- Read and validate required env vars ---
  // Failing loudly and immediately here (rather than letting createClient
  // silently receive `undefined`) avoids a confusing downstream error
  // from the Supabase SDK instead of a clear one from us.
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY. " +
        "Make sure .env.local is populated and you ran this with --env-file=.env.local.",
    );
    process.exit(1);
  }

  // Admin client: the secret key grants service-role-equivalent access,
  // which is required to call auth.admin.* methods at all -- these are
  // deliberately unavailable to the anon/publishable key.
  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  // --- Find the target user by email ---
  // supabase-js's admin API has no getUserByEmail method (only
  // getUserById, which needs a UUID we don't have yet) -- so we page
  // through listUsers() and match by email ourselves. This loop is
  // written to keep working correctly even once there are far more than
  // one page of users (i.e. once real vendor accounts exist), not just
  // for today's near-empty user table.
  const PAGE_SIZE = 200;
  let page = 1;
  let matchedUser: { id: string; app_metadata: Record<string, unknown> | undefined } | null =
    null;

  while (!matchedUser) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) {
      console.error(`Failed to list users (page ${page}):`, error.message);
      process.exit(1);
    }

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === targetEmail.toLowerCase(),
    );

    if (found) {
      matchedUser = { id: found.id, app_metadata: found.app_metadata };
      break;
    }

    // No match on this page. If the page came back short, we've reached
    // the end of the user list without finding anyone -- stop rather than
    // looping forever.
    if (data.users.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  if (!matchedUser) {
    console.error(`No user found with email "${targetEmail}".`);
    process.exit(1);
  }

  // --- Merge in the admin role and write it back ---
  // This is the one line that actually changes anything. mergeAdminRole()
  // does the safe merge (see that file's tests); this script's only job
  // is handing it the right input and writing the result back to
  // Supabase.
  const updatedAppMetadata = mergeAdminRole(matchedUser.app_metadata);

  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
    matchedUser.id,
    { app_metadata: updatedAppMetadata },
  );

  if (updateError) {
    console.error("Failed to update user:", updateError.message);
    process.exit(1);
  }

  // --- Confirm success ---
  // Printed for manual verification (per the handoff note: this write
  // can't be asserted by the Vitest suite, so confirming here -- and
  // ideally cross-checking with a direct SQL query against
  // auth.users.raw_app_meta_data -- is the actual verification step).
  console.log(`Success. User ${targetEmail} (${matchedUser.id}) now has app_metadata:`);
  console.log(JSON.stringify(updateData.user.app_metadata, null, 2));
}

main().catch((err) => {
  // Final safety net for anything not already caught above (e.g. a
  // network failure reaching Supabase at all).
  console.error("Unexpected error running set-admin-role script:", err);
  process.exit(1);
});