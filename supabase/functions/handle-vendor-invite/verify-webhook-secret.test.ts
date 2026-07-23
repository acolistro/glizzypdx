// verify-webhook-secret.test.ts
//
// WHAT THIS FILE DOES: unit tests for verifyWebhookSecret(), the
// constant-time comparison used to authenticate the vendor-invite-acceptance
// Database Webhook (GLPDX-163 / GLPDX-164).
//
// WHERE ITS DATA COMES FROM: hand-written fixture strings below — no
// Supabase, no network, no environment variables. This function is pure,
// so the tests are pure too.
//
// WHY THIS RUNS UNDER VITEST EVEN THOUGH THE REAL CODE RUNS IN DENO:
// verify-webhook-secret.ts deliberately avoids any Deno-only or Node-only
// API (it only uses TextEncoder, which both runtimes provide), so the exact
// same file can be imported here under Node/Vitest and by the live Edge
// Function under Deno. This mirrors the pattern already used for
// verify-turnstile.ts — pull the logic that needs testing out of the
// Deno.serve() handler into its own runtime-agnostic module.
import { describe, expect, it } from "vitest";
import { verifyWebhookSecret } from "./verify-webhook-secret";

describe("verifyWebhookSecret", () => {
  it("returns true when the received secret matches the expected secret exactly", () => {
    expect(verifyWebhookSecret("correct-horse-battery-staple", "correct-horse-battery-staple")).toBe(true);
  });

  it("returns false when the secrets are the same length but differ", () => {
    expect(verifyWebhookSecret("correct-horse-battery-staplf", "correct-horse-battery-staple")).toBe(false);
  });

  it("returns false when the secrets differ only in their first character", () => {
    // Guards against a naive loop that returns early on the first
    // mismatched byte -- that would make comparison time leak *where*
    // the first difference is, which defeats the point of a
    // constant-time check.
    expect(verifyWebhookSecret("xorrect-horse-battery-staple", "correct-horse-battery-staple")).toBe(false);
  });

  it("returns false when the received secret is shorter than expected", () => {
    expect(verifyWebhookSecret("too-short", "correct-horse-battery-staple")).toBe(false);
  });

  it("returns false when the received secret is longer than expected", () => {
    expect(verifyWebhookSecret("correct-horse-battery-staple-and-then-some", "correct-horse-battery-staple")).toBe(
      false,
    );
  });

  it("returns false when the received secret is an empty string", () => {
    expect(verifyWebhookSecret("", "correct-horse-battery-staple")).toBe(false);
  });

  it("returns false when the received secret is null (header was absent)", () => {
    // req.headers.get() returns null, not undefined, when a header is
    // missing -- this is the actual shape the real caller passes in.
    expect(verifyWebhookSecret(null, "correct-horse-battery-staple")).toBe(false);
  });

  it("returns false when both secrets are empty strings", () => {
    // An empty expected secret should never be treated as "no check
    // required" -- if WEBHOOK_SHARED_SECRET were ever accidentally set to
    // an empty string, every request should still be rejected, not
    // silently accepted.
    expect(verifyWebhookSecret("", "")).toBe(false);
  });

  it("does not throw on non-ASCII input", () => {
    // TextEncoder handles multi-byte UTF-8 fine, but it's worth locking in
    // that a stray unicode character in a header doesn't crash the
    // function -- crashing here would 500 the webhook instead of cleanly
    // rejecting it.
    expect(() => verifyWebhookSecret("sëcret", "secret")).not.toThrow();
    expect(verifyWebhookSecret("sëcret", "secret")).toBe(false);
  });

  // NOTE on timing: we deliberately do NOT assert on wall-clock timing
  // differences here. JS engines (V8's JIT in particular) make
  // microsecond-level timing assertions flaky and environment-dependent --
  // a flaky security test is worse than no timing test, because people
  // learn to ignore red CI. The protection this function provides comes
  // from its *implementation* (looping over every byte, never
  // short-circuiting on mismatch) rather than from a timing assertion in
  // this suite. Code review on verify-webhook-secret.ts is what actually
  // guards the constant-time property.
});