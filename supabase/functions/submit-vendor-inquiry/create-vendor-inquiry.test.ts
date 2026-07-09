import { describe, it, expect, vi } from "vitest";
import { createVendorInquiry } from "./create-vendor-inquiry";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a minimal fake Supabase client whose `.from().insert().select().single()`
 * chain resolves to whatever `insertResult` you pass in. This lets us test
 * createVendorInquiry's logic without touching a real database — the same
 * mocking pattern used in GLPDX-139 for handle-vendor-invite.
 */
function makeFakeSupabase(insertResult: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from } as unknown as SupabaseClient;
}

const validInput = {
  businessName: "Pink Dog Carts",
  contactEmail: "owner@pinkdogcarts.com",
  message: "We'd love to be listed on GlizzyPDX!",
  turnstileToken: "fake-turnstile-token",
};

describe("createVendorInquiry", () => {
  it("inserts a row and returns 'created' when the captcha token is valid", async () => {
    const supabase = makeFakeSupabase({
      data: { id: "11111111-1111-1111-1111-111111111111" },
      error: null,
    });
    const verifyTurnstile = vi.fn().mockResolvedValue({ success: true });

    const result = await createVendorInquiry(validInput, { supabase, verifyTurnstile });

    expect(result).toEqual({
      outcome: "created",
      inquiryId: "11111111-1111-1111-1111-111111111111",
    });
    // Confirms we verify the captcha BEFORE touching the database.
    expect(verifyTurnstile).toHaveBeenCalledWith("fake-turnstile-token");
    expect(supabase.from).toHaveBeenCalledWith("vendor_inquiries");
  });

  it("rejects with 'invalid_captcha' and never inserts when Turnstile says the token failed", async () => {
    const supabase = makeFakeSupabase({ data: null, error: null });
    const verifyTurnstile = vi.fn().mockResolvedValue({
      success: false,
      errorCodes: ["invalid-input-response"],
    });

    const result = await createVendorInquiry(validInput, { supabase, verifyTurnstile });

    expect(result).toEqual({ outcome: "invalid_captcha" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects with 'invalid_captcha' when no token is present at all", async () => {
    const supabase = makeFakeSupabase({ data: null, error: null });
    const verifyTurnstile = vi.fn();

    const result = await createVendorInquiry(
      { ...validInput, turnstileToken: "" },
      { supabase, verifyTurnstile },
    );

    expect(result).toEqual({ outcome: "invalid_captcha" });
    // Guard clause should short-circuit before ever calling Cloudflare.
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns 'verification_error' and never inserts when the Turnstile network call itself fails", async () => {
    const supabase = makeFakeSupabase({ data: null, error: null });
    const verifyTurnstile = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await createVendorInquiry(validInput, { supabase, verifyTurnstile });

    expect(result.outcome).toBe("verification_error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each([
    ["businessName", { ...validInput, businessName: "" }],
    ["businessName", { ...validInput, businessName: "   " }],
    ["contactEmail", { ...validInput, contactEmail: "" }],
    ["contactEmail", { ...validInput, contactEmail: "not-an-email" }],
    ["message", { ...validInput, message: "" }],
  ])("returns 'validation_error' when %s is invalid, without calling Turnstile or the database", async (_field, badInput) => {
    const supabase = makeFakeSupabase({ data: null, error: null });
    const verifyTurnstile = vi.fn();

    const result = await createVendorInquiry(badInput, { supabase, verifyTurnstile });

    expect(result.outcome).toBe("validation_error");
    // Validation happens first — no point spending a Turnstile API call
    // or a database round-trip on a request we already know is malformed.
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a message over the length limit", async () => {
    const supabase = makeFakeSupabase({ data: null, error: null });
    const verifyTurnstile = vi.fn();

    const result = await createVendorInquiry(
      { ...validInput, message: "a".repeat(2001) },
      { supabase, verifyTurnstile },
    );

    expect(result.outcome).toBe("validation_error");
  });

  it("returns 'database_error' when the insert fails after a valid captcha", async () => {
    const supabase = makeFakeSupabase({
      data: null,
      error: { message: "connection refused", code: "08006" },
    });
    const verifyTurnstile = vi.fn().mockResolvedValue({ success: true });

    const result = await createVendorInquiry(validInput, { supabase, verifyTurnstile });

    expect(result.outcome).toBe("database_error");
  });
});