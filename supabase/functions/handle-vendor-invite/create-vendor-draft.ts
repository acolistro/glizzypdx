// supabase/functions/handle-vendor-invite/create-vendor-draft.ts
//
// WHAT THIS FILE DOES:
// Contains the actual business logic for turning an accepted vendor invite
// into a draft `vendors` row. Deliberately written with NO Deno-specific
// imports so it can run — and be tested — under plain Node/Vitest, same as
// the rest of this codebase.
//
// WHERE ITS DATA COMES FROM:
// The Supabase Auth webhook payload for a `user.created` event, and the
// `vendor_inquiries` row referenced by that user's invite metadata.
//
// WHERE ITS DATA GOES:
// A new row inserted into `public.vendors` with status = 'draft'.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VendorInviteWebhookUser {
  id: string;
  // The real Database Webhook payload for auth.users exposes the raw
  // table column name, raw_user_meta_data, NOT the "user_metadata" field
  // the Auth API returns from endpoints like /admin/users or /invite.
  // Those are two different shapes for the same underlying data —
  // this one is what actually arrives when a webhook fires off a real
  // table INSERT, since it reads straight off the row, not through the
  // Auth API's response serialization.
  raw_user_meta_data?: {
    role?: string;
    inquiry_id?: string;
  };
}

export type CreateVendorDraftResult =
  | { outcome: "created"; vendorId: string }
  | { outcome: "skipped_not_vendor" }
  | { outcome: "skipped_duplicate" }
  | { outcome: "error"; message: string };

/**
 * Creates a draft `vendors` row for a newly-invited vendor user.
 *
 * @param user - The webhook payload's user object.
 * @param supabase - A Supabase client authenticated as `service_role`.
 *   MUST be service_role, not anon/authenticated — this insert has to bypass
 *   RLS, since `vendors` has no INSERT policy for any client role at all
 *   (see the schema comment in the migration: the draft row is only ever
 *   created by this server-side process).
 */
export async function createVendorDraft(
  user: VendorInviteWebhookUser,
  supabase: SupabaseClient,
): Promise<CreateVendorDraftResult> {
  // Guard 1: only act on invites explicitly tagged as vendor invites.
  // Without this, an admin's own login would incorrectly get a vendor
  // row created for them.
if (user.raw_user_meta_data?.role !== "vendor") { 
       return { outcome: "skipped_not_vendor" };
  }

  const inquiryId = user.raw_user_meta_data?.inquiry_id;

  // Guard 2: a vendor invite with no inquiry_id means someone sent an
  // invite without going through Gate 1 properly. Fail loudly rather
  // than silently creating a vendor row with no name to show.
  if (!inquiryId) {
    return {
      outcome: "error",
      message: `Vendor invite for user ${user.id} is missing inquiry_id in metadata`,
    };
  }

  // Fetch the Gate 1 inquiry data. We only need business_name — that's
  // the only field vendor_inquiries has that vendors.* also stores.
  // contact_email lives on auth.users already (that's what the invite
  // was sent to), so we don't duplicate it onto the vendors row.
  const { data: inquiry, error: inquiryError } = await supabase
    .from("vendor_inquiries")
    .select("business_name")
    .eq("id", inquiryId)
    .single();

  if (inquiryError || !inquiry) {
    return {
      outcome: "error",
      message: `No matching vendor_inquiries row for inquiry_id ${inquiryId} (user ${user.id})`,
    };
  }

  // Insert the draft vendor row. `name` is NOT NULL in the schema, so this
  // insert would fail loudly on its own if business_name were ever empty —
  // no extra guard needed for that case.
  //
  // If this user already has a vendors row (owner_user_id is unique — see
  // the migration), Postgres returns 23505 (unique_violation). Treated as
  // a successful no-op: a previous webhook delivery already did this work,
  // which is expected under at-least-once delivery semantics.
  const { data: vendor, error: insertError } = await supabase
    .from("vendors")
    .insert({
      owner_user_id: user.id,
      status: "draft",
      name: inquiry.business_name,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { outcome: "skipped_duplicate" };
    }
    return {
      outcome: "error",
      message: `Failed to insert draft vendor row for user ${user.id}: ${insertError.message}`,
    };
  }

  return { outcome: "created", vendorId: vendor.id };
}