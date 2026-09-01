// supabase/functions/admin-list-inquiries/index.ts
//
// WHAT THIS FILE DOES: the Edge Function entry point for GLPDX-130's
// "review inquiries queue" step. Deliberately thin — builds one
// service-role client, uses it both to verify the caller is an admin
// and to run the actual query. Almost no logic lives here; see
// list-inquiries.ts for the query and _shared/require-admin.ts for the
// role check.
//
// WHERE ITS DATA COMES FROM: a GET request from the admin portal's
// inquiries queue view, with the admin's Supabase session token in the
// Authorization header (Bearer scheme).
//
// WHERE ITS DATA GOES: an HTTP response back to the browser — either the
// list of pending vendor_inquiries rows, or an error status if the
// caller isn't an authenticated admin or something goes wrong.
//
// AUTH MODEL: this function keeps the platform's default verify_jwt
// gateway check ON (unlike handle-vendor-invite, which is a
// trigger-called webhook and intentionally opts out). The gateway proves
// "this is a validly-signed session," and requireAdmin() then proves
// "and that session belongs to an admin" — two separate checks, both
// required.
//
// ONE CLIENT, TWO JOBS: we deliberately do NOT build a separate
// lightweight anon-key client just to call auth.getUser(). GLPDX-163
// disabled the legacy anon/service_role API keys entirely, so relying on
// a legacy SUPABASE_ANON_KEY env var here would be building on a key
// that may no longer be valid. auth.getUser(token) doesn't care what
// role the calling client itself has — it just validates the passed-in
// user token — so the one service-role client built below (new
// SUPABASE_SECRET_KEYS system) does double duty for both the admin
// check and the actual query.
//
// WHY ADMIN_SECRET_KEY_NAME IS AN ENV VAR, NOT A HARDCODED CONSTANT:
// Supabase's local CLI-managed stack always names its one secret key
// "secret" — a fixed name it doesn't let you change. Production lets you
// create arbitrarily-named keys via the Dashboard, and this project's
// current production key is named "default_2" (see GLPDX-163). These
// will never match by coincidence, so the name itself has to be
// environment config, not a literal in code — matching this codebase's
// existing WEBHOOK_SHARED_SECRET pattern in handle-vendor-invite. Set
// locally via supabase/functions/.env, and in production via
// `supabase secrets set ADMIN_SECRET_KEY_NAME=default_2`.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/cors.ts";
import { extractBearerToken } from "../_shared/extract-bearer-token.ts";
import { requireAdmin } from "../_shared/require-admin.ts";
import { createServiceRoleClient } from "../_shared/create-service-role-client.ts";
import { listInquiries } from "./list-inquiries.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const token = extractBearerToken(req);

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Fail closed: refuse every request if this deployment forgot to set
  // ADMIN_SECRET_KEY_NAME, rather than falling back to a guessed default
  // that would be silently wrong in at least one environment.
  const secretKeyName = Deno.env.get("ADMIN_SECRET_KEY_NAME");
  if (!secretKeyName) {
    console.error("admin-list-inquiries: ADMIN_SECRET_KEY_NAME is not configured");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const clientResult = createServiceRoleClient({
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    secretKeysRaw: Deno.env.get("SUPABASE_SECRET_KEYS"),
    secretKeyName,
    createClient,
  });

  if (clientResult.outcome !== "success") {
    console.error(`admin-list-inquiries: failed to build service-role client (${clientResult.outcome})`);
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const adminCheck = await requireAdmin(token, { supabase: clientResult.supabase });

  if (!adminCheck.isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const result = await listInquiries({ supabase: clientResult.supabase });

  if (result.outcome === "database_error") {
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});