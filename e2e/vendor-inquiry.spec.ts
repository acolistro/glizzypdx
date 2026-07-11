import { test, expect } from "@playwright/test";

/**
 * E2E test for GLPDX-129: the public vendor inquiry form (Gate 1).
 *
 * IMPORTANT: Cloudflare Turnstile actively detects headless/automated
 * browsers and can silently refuse to render its challenge UI even when
 * using Cloudflare's own "always passes" dummy sitekey — this was
 * confirmed while building this test (the real api.js loaded
 * successfully, but no widget ever mounted in the DOM). Trying to drive
 * the real widget through Playwright is fighting Turnstile's own bot
 * detection, not a solvable test-authoring problem.
 *
 * Instead, we intercept the network request for Turnstile's script and
 * serve a tiny fake implementation that immediately invokes the
 * `callback` option with a fake token — exactly what a real successful
 * challenge does from InquiryForm's point of view. This means this test
 * does NOT exercise Cloudflare's real widget rendering/challenge flow —
 * that's out of scope for E2E and isn't really testable in an automated
 * browser anyway. What IS still fully real and tested end-to-end here:
 * InquiryForm's handling of a successful token, the Edge Function,
 * the real siteverify round-trip (server-side, using the Cloudflare
 * dummy sitekey/secret pair), and the real database insert.
 *
 * Local Supabase (`supabase start`) and the submit-vendor-inquiry
 * function (`supabase functions serve`) must be running before this
 * test suite runs.
 */
test.describe("Vendor inquiry form", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Turnstile's script before it's ever requested. The
    // @marsidev/react-turnstile wrapper appends an `onload` query param
    // naming a global callback function it expects to be invoked once
    // the script is "ready" — we read that param out of the intercepted
    // request URL so our fake script correctly signals readiness the
    // same way the real one would, regardless of what name the wrapper
    // library happens to generate for it.
    await page.route(
      "https://challenges.cloudflare.com/turnstile/v0/api.js**",
      async (route) => {
        const url = new URL(route.request().url());
        const onloadParam = url.searchParams.get("onload");

        const fakeScript = `
          window.turnstile = {
            render: function (container, options) {
              // Real Turnstile takes a moment to resolve a challenge;
              // a small delay here keeps this closer to real widget
              // timing rather than resolving instantly on the same tick,
              // which can sometimes mask race conditions in the app code
              // that a real (slower) widget wouldn't.
              setTimeout(function () {
                if (options && typeof options.callback === "function") {
                  options.callback("fake-e2e-turnstile-token");
                }
              }, 50);
              return "fake-widget-id";
            },
            reset: function () {},
            remove: function () {},
          };
          ${onloadParam ? `if (typeof window["${onloadParam}"] === "function") { window["${onloadParam}"](); }` : ""}
        `;

        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fakeScript,
        });
      },
    );
  });

  test("submits successfully with valid data and a stubbed Turnstile success", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabel(/business name/i).fill("Playwright Test Cart");
    await page
      .getByLabel(/contact email/i)
      .fill("playwright-e2e@example.com");
    await page
      .getByLabel(/message/i)
      .fill("Automated E2E test submission — safe to ignore/delete.");

    // No widget interaction needed now — the stubbed script's render()
    // fires the callback on its own, same as InquiryForm.test.tsx's
    // mock does at the component level. We just wait for the resulting
    // state change (submit button becoming enabled) as the real signal.
    const submitButton = page.getByRole("button", { name: /submit/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });

    await submitButton.click();

    // Success state replaces the form entirely (see InquiryForm.tsx) —
    // this confirms the real chain worked: Edge Function → siteverify
    // (using Cloudflare's dummy sitekey/secret pair, configured via
    // supabase/functions/.env) → database insert → 201 → UI update.
    await expect(page.getByText(/we got it/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows a validation error and does not submit with an invalid email", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByLabel(/business name/i).fill("Playwright Test Cart");
    await page.getByLabel(/contact email/i).fill("not-an-email");
    await page.getByLabel(/message/i).fill("This should not submit.");

    const submitButton = page.getByRole("button", { name: /submit/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    await expect(page.getByText(/valid email/i)).toBeVisible();
    await expect(page.getByText(/we got it/i)).not.toBeVisible();
  });
});