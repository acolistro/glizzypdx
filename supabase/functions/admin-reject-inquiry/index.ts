/**
 * index.ts — admin-reject-inquiry Edge Function
 *
 * WHAT THIS DOES:
 * HTTP entry point for GLPDX-130. An authenticated admin POSTs an
 * inquiry ID; this handler verifies the caller is an admin, then
 * delegates to rejectInquiry() to hard-delete the row. Deliberately
 * the same shape as admin-approve-inquiry/index.ts so the two mutating
 * admin functions read identically — the only difference is which
 * business-logic module runs at the end.
 *
 * WHERE ITS DATA COMES FROM:
 * - The HTTP request: an `Authorization: Bearer <token>` header, plus a
 *   JSON body of shape `{ inquiryId: string }`.
 * - Deno.env: SUPABASE_URL, SUPABASE_SECRET_KEYS (JSON), and
 *   ADMIN_SECRET_KEY_NAME (read from env, not hardcoded — its value
 *   differs between local "default" and production "default_2").
 *
 * WHERE ITS OUTPUT GOES:
 * - An HTTP Response to the admin UI: 200 on success, 4xx for
 *   auth/validation problems, 500 for server-side failures.
 * - As a side effect of success: the vendor_inquiries row is deleted.
 *   No Auth side effect (unlike approve, which invites a user).
 *
 * NON-OBVIOUS PATTERN:
 * No unit test of its own — matches the codebase convention that thin
 * index.ts handlers are covered by smoke tests (the 401/403/200 auth
 * chain), not Vitest; only the extracted business-logic module is unit
 * tested. Two of the shared helpers return discriminated unions rather
 * than throwing (createServiceRoleClient's `outcome`, requireAdmin's
 * `isAdmin`), which is why this handler narrows on those fields
 * explicitly.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/cors.ts";
import { extractBearerToken } from "../_shared/extract-bearer-token.ts";
import { requireAdmin } from "../_shared/require-admin.ts";
import { createServiceRoleClient } from "../_shared/create-service-role-client.ts";
import { rejectInquiry } from "./reject-inquiry.ts";

Deno.serve(async (req: Request) => {
  // Preflight is answered before any auth logic — the browser sends no
  // Authorization header on an OPTIONS request.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Mutating action (deletes a row), so POST only.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // extractBearerToken takes the whole Request and reads the header
  // itself; returns null for missing/malformed rather than throwing.
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const secretKeyName = Deno.env.get("ADMIN_SECRET_KEY_NAME");
  if (!secretKeyName) {
    return new Response(
      JSON.stringify({
        error: "Server misconfigured: missing secret key name",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  // createServiceRoleClient returns a discriminated union — narrow on
  // outcome === "success" before reading .supabase.
  const clientResult = createServiceRoleClient({
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    secretKeysRaw: Deno.env.get("SUPABASE_SECRET_KEYS"),
    secretKeyName,
    createClient,
  });

  if (clientResult.outcome !== "success") {
    console.error(`createServiceRoleClient failed: ${clientResult.outcome}`);
    return new Response(
      JSON.stringify({
        error: "Server misconfigured: could not build Supabase client",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const client = clientResult.supabase;

  // One client, two jobs: the requireAdmin() check and the privileged
  // delete both run off this same service-role client. requireAdmin
  // returns { isAdmin, userId } — narrow on isAdmin, not truthiness of
  // the whole object.
  const adminCheck = await requireAdmin(token, { supabase: client });
  if (!adminCheck.isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Parse and validate the body. try/catch because req.json() throws on
  // malformed JSON rather than returning an error value.
  let inquiryId: string;
  try {
    const body = await req.json();
    if (typeof body.inquiryId !== "string" || body.inquiryId.length === 0) {
      throw new Error("inquiryId missing or not a string");
    }
    inquiryId = body.inquiryId;
  } catch {
    return new Response(
      JSON.stringify({
        error: "Request body must be JSON: { inquiryId: string }",
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const result = await rejectInquiry(client, inquiryId);

  if (!result.success) {
    // "Inquiry not found" and a real delete failure both map to 500
    // here for now — revisit with per-case codes if the UI ever needs
    // to distinguish them.
    return new Response(JSON.stringify({ error: result.error }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});