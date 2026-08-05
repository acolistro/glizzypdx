import { test, expect } from "@playwright/test";
import { stubTurnstile } from "./helpers/turnstile";

/**
 * E2E test for GLPDX-129: the public vendor inquiry form (Gate 1).
 *
 * Turnstile is stubbed via `stubTurnstile()` (see e2e/helpers/turnstile.ts
 * for why the real widget can't be driven in an automated browser). That
 * stub covers the token-acquisition step only — everything downstream of
 * "a token was obtained" is real and genuinely exercised here:
 * InquiryForm's handling of a successful token, the Edge Function, the
 * real siteverify round-trip (server-side, using the Cloudflare dummy
 * sitekey/secret pair), and the real database insert.
 *
 * Local Supabase (`supabase start`) and the submit-vendor-inquiry
 * function (`supabase functions serve`) must be running before this
 * test suite runs.
 */
test.beforeEach(async ({ page }) => {
  await stubTurnstile(page);
});