import type { Page } from "@playwright/test";

/**
 * Stubs out Cloudflare Turnstile for E2E tests.
 *
 * WHY THIS EXISTS
 * Cloudflare Turnstile actively detects headless/automated browsers and
 * can silently refuse to render its challenge UI even when using
 * Cloudflare's own "always passes" dummy sitekey — confirmed while
 * building the vendor inquiry E2E test (the real api.js loaded
 * successfully, but no widget ever mounted in the DOM). Trying to drive
 * the real widget through Playwright is fighting Turnstile's own bot
 * detection, not a solvable test-authoring problem.
 *
 * WHAT IT DOES
 * Intercepts the network request for Turnstile's script and serves a
 * tiny fake implementation that immediately invokes the `callback`
 * option with a fake token — exactly what a real successful challenge
 * does from the consuming form's point of view.
 *
 * WHAT THIS MEANS FOR TEST COVERAGE
 * Tests using this stub do NOT exercise Cloudflare's real widget
 * rendering/challenge flow — that's out of scope for E2E and isn't
 * really testable in an automated browser anyway. Everything downstream
 * of "a token was obtained" remains fully real: the form's handling of
 * a successful token, and whatever server-side verification that token
 * feeds into.
 *
 * WHERE ITS DATA COMES FROM / GOES
 * Takes a Playwright `Page` and registers a route handler on it. Has no
 * return value — its entire effect is the interception it installs on
 * that page. Call it before the page navigates (typically in a
 * `beforeEach`), since the interception must be in place before the
 * app ever requests the script.
 *
 * EXTRACTED (GLPDX-124) from e2e/vendor-inquiry.spec.ts, which was the
 * sole consumer until the admin login spec became the second. The logic
 * is unchanged — it was already fully generic, referencing no
 * particular form.
 *
 * USAGE
 *   test.beforeEach(async ({ page }) => {
 *     await stubTurnstile(page);
 *   });
 */
export async function stubTurnstile(page: Page): Promise<void> {
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
}