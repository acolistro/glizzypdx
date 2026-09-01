/**
 * approve-inquiry.ts
 *
 * WHAT THIS DOES:
 * Business logic for approving a vendor inquiry (Gate 1 of the two-gate
 * onboarding model, GLPDX-130 / GLPDX-176). Given an inquiry ID, this
 * looks up the inquiry's contact email, sends that person a Supabase
 * Auth invite, and only marks the inquiry as "actioned" if the invite
 * succeeds.
 *
 * WHERE ITS DATA COMES FROM:
 * - `inquiryId`: passed in from the HTTP request body (see index.ts).
 *   We deliberately do NOT accept a contact email from the caller —
 *   the row in `vendor_inquiries` is the source of truth for who gets
 *   invited, not whatever the request body claims. A client bug or a
 *   tampered request should never be able to redirect an admin invite
 *   to a different email address.
 * - `client`: a Supabase client built with the service-role secret key,
 *   injected in (not constructed here) so this function stays
 *   unit-testable without touching Deno.env or making a real network
 *   call. Same pattern as list-inquiries.ts.
 *
 * WHERE ITS OUTPUT GOES:
 * - Mutates the `vendor_inquiries` table (status flips 'new' ->
 *   'actioned')
 * - Triggers a Supabase Auth side effect: a new Auth user is created in
 *   an "invited" state. In production, once an email provider is
 *   configured, this also sends the vendor an email — locally it's
 *   caught by Mailpit instead. That gap is a known, tracked dependency
 *   (see GLPDX-130's description), not a bug in this function.
 *
 * NON-OBVIOUS PATTERN:
 * We deliberately do NOT flip the inquiry's status if the invite call
 * fails. This is per GLPDX-176's test scope: a failed invite should
 * leave the row in its original 'new' state so it's retried by the
 * admin, rather than silently vanishing from the queue with no invite
 * ever having gone out.
 *
 * The return type is a discriminated union (`{ success: true }` vs.
 * `{ success: false; error: string }`) rather than throwing. This is
 * the closest React/TS equivalent to a Kotlin sealed class — TypeScript
 * won't let index.ts read `result.error` without first narrowing on
 * `result.success`, which keeps the caller honest about handling both
 * branches.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Narrow shape for the one column we actually need off the inquiry row,
// rather than a full row type. Same reasoning as list-inquiries.ts's
// explicit column list instead of select("*") — this protects against
// a future migration silently adding a sensitive column that this
// function would otherwise pull in without meaning to.
interface InquiryContactEmail {
  contact_email: string;
}

export type ApproveInquiryResult =
  | { success: true }
  | { success: false; error: string };

export async function approveInquiry(
  client: SupabaseClient,
  inquiryId: string,
): Promise<ApproveInquiryResult> {
  // Step 1: look up the contact email server-side, keyed off the ID
  // the admin UI sent. See the file-level doc comment for why we never
  // trust a client-supplied email here instead.
  const { data: inquiry, error: fetchError } = await client
    .from("vendor_inquiries")
    .select("contact_email")
    .eq("id", inquiryId)
    .single<InquiryContactEmail>();

  if (fetchError || !inquiry) {
    return { success: false, error: "Inquiry not found" };
  }

  // Step 2: send the invite. This is a Supabase Auth Admin API call —
  // it creates an Auth user in an "invited" state and (once a
  // production email provider is configured) emails them a signup
  // link that lands them in the vendor portal to build their profile
  // (Gate 2).
  const { error: inviteError } = await client.auth.admin.inviteUserByEmail(
    inquiry.contact_email,
  );

  if (inviteError) {
    // Deliberately NOT touching the row's status here — see the
    // "NON-OBVIOUS PATTERN" note above. Left as 'new' so it's retried.
    return { success: false, error: inviteError.message };
  }

  // Step 3: only now, after a confirmed-successful invite, mark the
  // inquiry actioned so it drops out of the admin's pending queue.
  const { error: updateError } = await client
    .from("vendor_inquiries")
    .update({ status: "actioned" })
    .eq("id", inquiryId);

  if (updateError) {
    // Edge case worth naming explicitly: the invite succeeded but the
    // status update failed. The vendor now has a real invite in
    // flight, but the admin queue still shows this row as pending —
    // re-approving would call inviteUserByEmail a second time for the
    // same person. Not silently swallowing this: it's surfaced as an
    // error rather than reported as a false success.
    return { success: false, error: updateError.message };
  }

  return { success: true };
}