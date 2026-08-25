import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Business logic for the admin-list-inquiries Edge Function (GLPDX-130).
// Fetches every vendor_inquiries row still awaiting admin review
// (status = 'new'), oldest first, so the admin works through the
// backlog in the order inquiries came in.
//
// Where its data comes from: an injected Supabase client (constructed by
// index.ts using the service_role key — this table has no `authenticated`
// grants at all, so this query can only ever succeed with service_role).
// Dependency injection here follows the same pattern as
// createVendorInquiry: the caller decides how the client gets built, this
// function only decides what query to run with it.
//
// Where its output goes: index.ts serializes the result to JSON and
// returns it to the admin portal's inquiries queue view.
// -----------------------------------------------------------------------

export interface VendorInquiryRow {
  id: string;
  business_name: string;
  contact_email: string;
  message: string | null;
  status: string;
  created_at: string;
}

export type ListInquiriesResult =
  | { outcome: "success"; inquiries: VendorInquiryRow[] }
  | { outcome: "database_error" };

export async function listInquiries(
  deps: { supabase: SupabaseClient },
): Promise<ListInquiriesResult> {
  const { data, error } = await deps.supabase
    .from("vendor_inquiries")
    .select("id, business_name, contact_email, message, status, created_at")
    .eq("status", "new")
    .order("created_at", { ascending: true });

  if (error) {
    return { outcome: "database_error" };
  }

  return { outcome: "success", inquiries: (data ?? []) as VendorInquiryRow[] };
}