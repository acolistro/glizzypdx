// supabase/functions/submit-vendor-inquiry/verify-turnstile.test.ts
//
// WHAT THIS FILE DOES: Tests verifyTurnstile()'s branching logic against
// a mocked global fetch, rather than making real calls to Cloudflare's
// siteverify endpoint. Covers: a genuine success response, a response
// where Cloudflare says the token failed verification (still a 200 OK —
// "the check ran, and it said no" is different from "the check itself
// broke"), a non-2xx HTTP failure from Cloudflare's endpoint itself, and
// the shape of the outgoing request (right URL, right body).
//
// WHERE ITS DATA COMES FROM: vi.fn() standing in for the global fetch
// function, with each test configuring what that mock resolves to.
//
// WHERE ITS DATA GOES: assertions only — this file makes no real network
// calls at all, which is what makes it fast and deterministic instead of
// depending on Cloudflare's actual service being reachable during tests.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "./verify-turnstile";

describe("verifyTurnstile", () => {
  beforeEach(() => {
    // Replace the real global fetch with a mock for the duration of each
    // test. vi.stubGlobal (rather than directly assigning global.fetch)
    // is Vitest's own mechanism for this and gets cleaned up reliably by
    // unstubAllGlobals below, even if a test fails partway through.
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success: true with no error codes when Turnstile verifies the token", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const result = await verifyTurnstile("real-token", "shh-secret");

    expect(result).toEqual({ success: true, errorCodes: undefined });
  });

  it("returns success: false with error codes when Cloudflare reports the token failed", async () => {
    // This is a 200 OK from Cloudflare's endpoint -- the HTTP request
    // itself succeeded, but Cloudflare's own verdict on the token was
    // negative (e.g. expired or already-used token). Distinguishing this
    // from the non-2xx case below is the whole reason this function
    // returns a result object instead of just throwing on any failure.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    } as Response);

    const result = await verifyTurnstile("expired-token", "shh-secret");

    expect(result).toEqual({
      success: false,
      errorCodes: ["timeout-or-duplicate"],
    });
  });

  it("throws when Cloudflare's siteverify endpoint itself returns a non-2xx status", async () => {
    // This is the "the check couldn't even run" case -- e.g. Cloudflare's
    // endpoint is down, or the request was malformed. Deliberately
    // different from a false-but-successful verification above: this one
    // throws rather than returning a result, because there's no
    // meaningful success/failure verdict to hand back to the caller.
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    await expect(verifyTurnstile("some-token", "shh-secret")).rejects.toThrow(
      "Turnstile siteverify responded with 503",
    );
  });

  it("sends the token and secret key in the request body to the correct endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    await verifyTurnstile("the-token", "the-secret");

    // Confirms verifyTurnstile is sending Cloudflare's expected field
    // names (`secret`, `response`) -- Turnstile's API uses `response` for
    // the token, not `token`, which is an easy field-name mismatch to
    // introduce accidentally in a refactor without a test catching it.
    expect(fetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "the-secret", response: "the-token" }),
      },
    );
  });
});