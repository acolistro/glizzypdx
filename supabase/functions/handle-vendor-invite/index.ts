// supabase/functions/handle-vendor-invite/index.ts
//
// WHAT THIS FILE DOES:
// The actual Supabase Edge Function entry point, configured as the target
// of the Auth "user.created" webhook (Dashboard → Authentication → Hooks).
// Deliberately kept minimal — it just parses the incoming request and hands
// off to createVendorDraft(). Almost all logic lives in
// create-vendor-draft.ts so it can be unit tested with Vitest; Deno's
// runtime can't run our Node-based test suite directly.
//
// WHERE ITS DATA COMES FROM: the HTTP request body Supabase Auth sends.
// WHERE ITS DATA GOES: an HTTP response back to Supabase Auth's webhook caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createVendorDraft, type VendorInviteWebhookUser } from "./create-vendor-draft.ts";

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const user = payload.record as VendorInviteWebhookUser;

    // service_role client — required to bypass RLS for this system-level
    // insert. These env vars are auto-injected by the Supabase Edge Runtime;
    // never hardcode them.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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