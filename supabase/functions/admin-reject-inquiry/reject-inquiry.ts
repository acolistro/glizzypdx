/**
 * reject-inquiry.ts
 *
 * WHAT THIS DOES:
 * Business logic for rejecting a vendor inquiry (GLPDX-130 / GLPDX-176).
 * Given an inquiry ID, this hard-deletes the row from vendor_inquiries.
 * Rejection is a delete, not a status change — a rejected inquiry leaves
 * no account and no lingering record, consistent with the two-gate
 * model's "rejecting an inquiry deletes it with no account created".
 *
 * WHERE ITS DATA COMES FROM:
 * - `inquiryId`: from the HTTP request body (see index.ts). As with
 *   approveInquiry, we key strictly off the ID — there's nothing
 *   client-supplied here to trust beyond which row to remove.
 * - `client`: a service-role Supabase client, injected in (not built
 *   here) so this stays unit-testable without Deno.env or a real
 *   network call. Same pattern as approve-inquiry.ts.
 *
 * WHERE ITS OUTPUT GOES:
 * - Mutates vendor_inquiries (the row is deleted).
 * - Returns a discriminated result the caller (index.ts) narrows on to
 *   choose a 200 vs an error response. No Auth side effect here, unlike
 *   approveInquiry — rejection never touches Supabase Auth.
 *
 * NON-OBVIOUS PATTERN:
 * `.delete().eq("id", x)` succeeds with error: null even when zero rows
 * match — Postgres/PostgREST treat "deleted nothing" as a valid delete.
 * That would let a stale or already-handled ID report a false success.
 * To avoid that, we chain `.select("id")` so the delete returns the
 * rows it actually removed, and treat an empty array as
 * "Inquiry not found". This mirrors approveInquiry's existence check so
 * the two admin actions behave consistently for a missing row.
 *
 * The confirm-before-delete dialog lives in the admin UI, not here —
 * that's a deliberate client-side decision (a server-side function
 * can't show a dialog), so this function deletes unconditionally once
 * called.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type RejectInquiryResult =
  | { success: true }
  | { success: false; error: string };

export async function rejectInquiry(
  client: SupabaseClient,
  inquiryId: string,
): Promise<RejectInquiryResult> {
  // Delete the row and ask for the deleted id(s) back in the same call.
  // See the "NON-OBVIOUS PATTERN" note above for why the .select() is
  // load-bearing rather than cosmetic.
  const { data, error } = await client
    .from("vendor_inquiries")
    .delete()
    .eq("id", inquiryId)
    .select("id");

  if (error) {
    return { success: false, error: error.message };
  }

  // Empty array = the id matched nothing. Report it rather than
  // silently claiming success on a no-op delete.
  if (!data || data.length === 0) {
    return { success: false, error: "Inquiry not found" };
  }

  return { success: true };
}