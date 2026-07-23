// supabase/functions/handle-vendor-invite/index.ts
//
// WHAT THIS FILE DOES:
// The actual Supabase Edge Function entry point. It is called by a
// Postgres Database Webhook trigger (see the "vendor-invite-acceptance"
// trigger, defined in supabase/migrations -- NOT the Authentication ->
// Hooks feature; those are two different Supabase mechanisms, and this
// comment used to say the wrong one) that fires AFTER INSERT on
// auth.users. Deliberately kept minimal -- it verifies the caller, parses
// the incoming request, and hands off to createVendorDraft(). Almost all
// business logic lives in create-vendor-draft.ts so it can be unit tested
// with Vitest; Deno's runtime can't run our Node-based test suite directly.
//
// WHERE ITS DATA COMES FROM: the HTTP request the Database Webhook trigger
// sends -- an X-Webhook-Secret header (see GLPDX-163) plus a JSON body
// shaped like { type, table, record }, where `record` is the raw Postgres
// row from auth.users (so its metadata column is `raw_user_meta_data`, not
// `user_metadata` -- those are different names in the Auth API response
// vs. the raw table row; see GLPDX-140 notes if this trips you up again).
//
// WHERE ITS DATA GOES: an HTTP response back to the Database Webhook
// trigger (which doesn't do anything with the response body, only the
// status code) and, via createVendorDraft(), a new row in `vendors`.
//
// AUTH MODEL (GLPDX-163): this function is deployed with --no-verify-jwt,
// so Supabase's platform JWT gateway does NOT check the caller's identity
// for us -- unlike most Edge Functions, which get that check for free.
// We're intentionally opting out of it because the caller here is a
// Postgres trigger, not a browser or our own frontend, and giving it a
// full-privilege service_role JWT just to prove "yes, this really is our
// trigger" was the whole problem GLPDX-163 fixes. Instead, the trigger
// sends a single-purpose shared secret (stored in Supabase Vault on the
// database side, and via `supabase secrets set` on this function's side)
// that only proves "this request came from our trigger" -- it can't be
// used for anything else, unlike a service_role key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createVendorDraft, type VendorInviteWebhookUser } from "./create-vendor-draft.ts";
import { verifyWebhookSecret } from "./verify-webhook-secret.ts";

// Name of the Supabase secret key (Dashboard -> Settings -> API Keys ->
// Secret keys) this function reads for its own service-role-equivalent
// client. This is a NAME, not the key's value -- safe to have in source.
// Update this single constant whenever the key is rotated, instead of
// hunting through the function body: "default" was replaced with
// "default_2" as part of GLPDX-163, after "default" itself ended up
// exposed in a chat session before it was ever wired into any code.
const SECRET_KEY_NAME = "default_2";

Deno.serve(async (req: Request) => {
  try {
    // --- Shared-secret verification (GLPDX-163) ---
    // Read the secret this deployment expects. It's injected as an
    // environment variable via `supabase secrets set` -- a project-specific
    // secret we invented for this one purpose, distinct from any
    // Supabase-issued key (see the secret key handling further down).
    const expectedSecret = Deno.env.get("WEBHOOK_SHARED_SECRET");

    if (!expectedSecret) {
      // Fail closed: if the secret isn't configured at all, refuse every
      // request rather than silently accepting unauthenticated ones. This
      // should only happen if a deploy forgets to run `supabase secrets
      // set` -- treat it as a misconfiguration, not a "no check needed"
      // signal.
      console.error("handle-vendor-invite: WEBHOOK_SHARED_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
    }

    const receivedSecret = req.headers.get("x-webhook-secret");

    if (!verifyWebhookSecret(receivedSecret, expectedSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // --- Existing invite-acceptance logic (GLPDX-51), unchanged below ---
    const payload = await req.json();
    const user = payload.record as VendorInviteWebhookUser;

    // service-role-equivalent client -- required to bypass RLS for this
    // system-level insert. Deliberately reads the NEW-format secret key
    // (SUPABASE_SECRET_KEYS) rather than the legacy SUPABASE_SERVICE_ROLE_KEY.
    // Both are auto-injected by the Supabase Edge Runtime, but GLPDX-163
    // disables the legacy service_role key as part of rotating the
    // compromised one -- if this still read SUPABASE_SERVICE_ROLE_KEY,
    // that disable step would silently break vendor draft creation.
    // SUPABASE_SECRET_KEYS is a JSON object keyed by name, not a plain
    // string like the legacy var -- SECRET_KEY_NAME above is which entry
    // this function reads.
    // See: https://supabase.com/docs/guides/functions/secrets
    //
    // This requires a secret key to already exist in the project (Settings
    // -> API Keys -> "Create new secret key") -- if none exists yet,
    // SUPABASE_SECRET_KEYS won't be populated and this will fail closed
    // below, rather than silently falling back to an undefined key.
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!secretKeysRaw) {
      console.error(
        "handle-vendor-invite: SUPABASE_SECRET_KEYS is not populated -- " +
          "create a secret key in Settings > API Keys before deploying this function",
      );
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
    }

    let secretKeyValue: string | undefined;
    try {
      secretKeyValue = JSON.parse(secretKeysRaw)[SECRET_KEY_NAME];
    } catch (parseErr) {
      console.error("handle-vendor-invite: SUPABASE_SECRET_KEYS was not valid JSON", parseErr);
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
    }

    if (!secretKeyValue) {
      console.error(`handle-vendor-invite: no '${SECRET_KEY_NAME}' entry in SUPABASE_SECRET_KEYS`);
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKeyValue);

    const result = await createVendorDraft(user, supabase);

    if (result.outcome === "error") {
      console.error(result.message);
      return new Response(JSON.stringify({ error: result.message }), { status: 500 });
    }

    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    console.error("handle-vendor-invite: unexpected error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});