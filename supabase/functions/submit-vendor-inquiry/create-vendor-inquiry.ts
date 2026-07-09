import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The shape of data the frontend form sends us. `turnstileToken` is the
 * token the Cloudflare Turnstile widget generates in the browser after
 * the user completes the checkbox challenge — it proves "a human (probably)
 * solved this challenge" but does NOT prove the form data is legitimate.
 * We still have to verify it server-side against Cloudflare's API, because
 * a malicious client could just send a fake string here.
 */
export interface VendorInquiryInput {
  businessName: string;
  contactEmail: string;
  message: string;
  turnstileToken: string;
}

/**
 * Result of asking Cloudflare "was this token real?". We inject this as a
 * function (verifyTurnstile) rather than calling fetch() directly inside
 * createVendorInquiry, so tests can swap in a fake version instead of
 * making real network calls. This is the same dependency-injection pattern
 * as passing in `supabase` instead of importing a singleton client.
 */
export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export type CreateVendorInquiryDeps = {
  supabase: SupabaseClient;
  verifyTurnstile: (token: string) => Promise<TurnstileVerifyResult>;
};

/**
 * The set of things that can happen when someone submits the inquiry form.
 * Using a discriminated union (the `outcome` field) instead of throwing
 * exceptions for expected failure cases (bad captcha, bad input) means the
 * caller (the Deno HTTP handler) can pattern-match on `outcome` and return
 * the right HTTP status code, without try/catch for things that aren't
 * actually exceptional — a bot submitting garbage is a NORMAL case for a
 * public form, not a bug.
 */
export type CreateVendorInquiryResult =
  | { outcome: "created"; inquiryId: string }
  | { outcome: "invalid_captcha" }
  | { outcome: "validation_error"; message: string }
  | { outcome: "verification_error" }
  | { outcome: "database_error" };

const MAX_MESSAGE_LENGTH = 2000;
const MAX_BUSINESS_NAME_LENGTH = 200;

// Deliberately simple email shape check — we are not trying to be a full
// RFC 5322 validator here, just catching obviously-wrong input before it
// hits the database. Supabase itself never sends a confirmation to this
// address (email provider integration is still pending, GLPDX-132), so
// there's no downstream harm in being permissive.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the inquiry form fields, independent of captcha or database
 * concerns. Returns a human-readable message describing the first problem
 * found, or null if everything looks fine.
 *
 * Kept as its own function (rather than inlined) so it's independently
 * testable and reusable if we ever need the same validation on the
 * frontend for instant feedback before submit.
 */
function validateInquiryInput(input: VendorInquiryInput): string | null {
  const businessName = input.businessName.trim();
  const contactEmail = input.contactEmail.trim();
  const message = input.message.trim();

  if (businessName.length === 0) {
    return "Business name is required.";
  }
  if (businessName.length > MAX_BUSINESS_NAME_LENGTH) {
    return `Business name must be ${MAX_BUSINESS_NAME_LENGTH} characters or fewer.`;
  }
  if (contactEmail.length === 0 || !EMAIL_PATTERN.test(contactEmail)) {
    return "A valid contact email is required.";
  }
  if (message.length === 0) {
    return "Message is required.";
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  return null;
}

/**
 * Core logic for Gate 1 of vendor onboarding: a public, anonymous inquiry
 * form submission.
 *
 * Where its data comes from: the HTTP request body, forwarded in by the
 * thin Deno wrapper (index.ts) after Deno.serve() parses it as JSON.
 *
 * Where its data goes: on success, a new row in the `vendor_inquiries`
 * table (anon INSERT-only per RLS — this function must run with the
 * service_role client to bypass RLS safely on the server, same pattern as
 * handle-vendor-invite). Alyssa reviews inquiries later from /admin.
 *
 * Order of operations matters here and is deliberate:
 *   1. Validate the form fields (cheapest check, no external calls)
 *   2. Verify the Turnstile token with Cloudflare (network call, but no DB write)
 *   3. Insert into the database (only after both above pass)
 * This ordering means a malformed request or a failed captcha never costs
 * us a database round-trip, and a Turnstile outage never costs us a
 * partially-written row.
 */
export async function createVendorInquiry(
  input: VendorInquiryInput,
  deps: CreateVendorInquiryDeps,
): Promise<CreateVendorInquiryResult> {
  const { supabase, verifyTurnstile } = deps;

  // Step 1: validate form shape before spending any external calls on it.
  const validationMessage = validateInquiryInput(input);
  if (validationMessage) {
    return { outcome: "validation_error", message: validationMessage };
  }

  // Step 2: an empty token is never valid — short-circuit without even
  // asking Cloudflare, since Cloudflare would just tell us the same thing.
  if (!input.turnstileToken) {
    return { outcome: "invalid_captcha" };
  }

  let verification: TurnstileVerifyResult;
  try {
    verification = await verifyTurnstile(input.turnstileToken);
  } catch {
    // Network failure, timeout, Cloudflare outage, etc. This is distinct
    // from "captcha was wrong" — we want to be able to tell the difference
    // in logs/monitoring later, even though both currently surface as a
    // generic error to the end user.
    return { outcome: "verification_error" };
  }

  if (!verification.success) {
    return { outcome: "invalid_captcha" };
  }

  // Step 3: captcha verified, form is valid — safe to write.
  const { data, error } = await supabase
    .from("vendor_inquiries")
    .insert({
      business_name: input.businessName.trim(),
      contact_email: input.contactEmail.trim(),
      message: input.message.trim(),
      status: "new",
    })
    .select()
    .single();

  if (error || !data) {
    return { outcome: "database_error" };
  }

  return { outcome: "created", inquiryId: (data as { id: string }).id };
}