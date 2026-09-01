/**
 * index.ts — admin-approve-inquiry Edge Function
 *
 * WHAT THIS DOES:
 * HTTP entry point for GLPDX-130. An authenticated admin POSTs an
 * inquiry ID; this handler verifies the caller is actually an admin,
 * then delegates to approveInquiry() for the invite + status-update
 * logic. Mirrors admin-list-inquiries/index.ts's guard-clause order on
 * purpose, so the two functions read the same way at a glance — the
 * only real differences are POST instead of GET and a JSON body
 * instead of no body.
 *
 * WHERE ITS DATA COMES FROM:
 * - The HTTP request: an `Authorization: Bearer <token>` header, plus a
 *   JSON body of shape `{ inquiryId: string }`
 * - Deno.env: SUPABASE_URL, SUPABASE_SECRET_KEYS (JSON), and
 *   ADMIN_SECRET_KEY_NAME. That last one is read from env rather than
 *   hardcoded because the *name* of the entry inside
 *   SUPABASE_SECRET_KEYS differs between local ("default", fixed by
 *   the Supabase CLI) and production ("default_2", whatever it was
 *   named in the Dashboard) — hardcoding either one would break the
 *   other environment.
 *
 * WHERE ITS OUTPUT GOES:
 * - An HTTP Response back to the admin UI: 200 on success, 4xx for
 *   auth/validation problems, 500 for unexpected/server-side failures
 * - As a side effect of success: a new Supabase Auth user (invited
 *   state) and an updated `vendor_inquiries` row — see
 *   approve-inquiry.ts for the actual mutation logic
 *
 * NON-OBVIOUS PATTERN:
 * This file has no unit test of its own — matches the established
 * convention in this codebase (see admin-list-inquiries/index.ts) that
 * thin index.ts handlers aren't unit tested directly; only the
 * extracted business-logic module is. What IS worth testing here (via
 * the smoke-test curl steps, not Vitest) is the full auth chain: no
 * token, non-admin token, and a real admin token — same three cases
 * already proven for admin-list-inquiries.
 *
 * Two of the three shared helpers below return discriminated unions
 * rather than throwing or returning a bare value — see
 * createServiceRoleClient's `outcome` field and requireAdmin's
 * `isAdmin`/`userId` shape. That's why this handler narrows on those
 * fields explicitly instead of trusting a truthy/falsy check.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/cors.ts";
import { extractBearerToken } from "../_shared/extract-bearer-token.ts";
import { requireAdmin } from "../_shared/require-admin.ts";
import { createServiceRoleClient } from "../_shared/create-service-role-client.ts";
import { approveInquiry } from "./approve-inquiry.ts";

Deno.serve(async (req: Request) => {
  // Browser preflight has to be answered before any other logic runs,
  // and without requiring auth — the browser doesn't send an
  // Authorization header on an OPTIONS request.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // This function mutates data (unlike admin-list-inquiries, which is
  // a pure read), so it must be POST, not GET.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // extractBearerToken takes the whole Request (it reads the
  // Authorization header itself), not a pre-extracted header string.
  // Returns null for anything missing/malformed rather than throwing,
  // which is what lets this be a plain guard clause.
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // See the file doc comment above for why this is read from env
  // rather than hardcoded the way handle-vendor-invite currently does.
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

  // createServiceRoleClient returns a discriminated union rather than
  // throwing or handing back a client unconditionally — every failure
  // mode (missing URL, missing SUPABASE_SECRET_KEYS, invalid JSON,
  // missing key entry) is a distinct `outcome` value the caller has to
  // narrow on before it can safely read `result.supabase`.
  const clientResult = createServiceRoleClient({
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    secretKeysRaw: Deno.env.get("SUPABASE_SECRET_KEYS"),
    secretKeyName,
    createClient,
  });

  if (clientResult.outcome !== "success") {
    // Every failure branch maps to the same 500 here — all of them are
    // server-side misconfiguration, not something the caller (the
    // admin UI) can act on differently. The outcome value itself is
    // still useful for debugging via logs even though it's not
    // exposed differently in the response body.
    console.error(
      `createServiceRoleClient failed: ${clientResult.outcome}`,
    );
    return new Response(
      JSON.stringify({ error: "Server misconfigured: could not build Supabase client" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const client = clientResult.supabase;

  // One client, two jobs (per this ticket's confirmed architecture
  // decision): built once from the service-role secret key, used both
  // for the requireAdmin() check below and for the privileged query
  // inside approveInquiry(). Deliberately no separate anon-key client —
  // legacy anon/service_role keys are disabled per GLPDX-163, so an
  // anon key may not even resolve to anything valid anymore.
  //
  // requireAdmin returns { isAdmin, userId } rather than a bare
  // boolean — narrow on isAdmin specifically, not on truthiness of the
  // whole result object (which is always truthy).
  const adminCheck = await requireAdmin(token, { supabase: client });
  if (!adminCheck.isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Parse and validate the request body. Wrapped in try/catch because
  // req.json() throws on malformed JSON rather than returning an error
  // value — one of the few spots in this file where try/catch is the
  // right tool instead of a guard clause.
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

  // Delegate to the tested business logic module.
  const result = await approveInquiry(client, inquiryId);

  if (!result.success) {
    // Every failure branch inside approveInquiry (not-found, invite
    // failure, update failure) currently maps to the same 500 here.
    // The admin UI can still show result.error either way, but this is
    // worth revisiting with per-case status codes if the UI ever needs
    // to branch on failure type (e.g. treating "not found" differently
    // from "invite service down").
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