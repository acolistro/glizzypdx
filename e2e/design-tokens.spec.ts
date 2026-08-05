import { test, expect } from "@playwright/test";

/**
 * design-tokens.spec.ts — Design system browser behavior (GLPDX-170)
 * ============================================================
 * WHAT THIS FILE TESTS:
 * The parts of the design token system (GLPDX-127) that only a real
 * browser can verify — computed styles, font resolution, focus
 * indicators, and the reduced-motion media query. The *static*
 * guarantees (tokens exist, no raw hex escapes into components) are
 * covered separately in src/styles/tokens.test.ts, which is much
 * faster and doesn't need a browser.
 *
 * WHY A SEPARATE FILE FROM smoke.spec.ts:
 * smoke.spec.ts answers exactly one question — "did the app boot?"
 * Keeping design-system assertions out of it means a smoke failure
 * still has an unambiguous meaning. Mixing them would turn every
 * styling regression into a "smoke test failed" alarm.
 *
 * WHY NO EXPLICIT VIEWPORT:
 * playwright.config.ts already runs every spec across five projects
 * (chromium/firefox/webkit desktop, plus mobile-chrome and
 * mobile-safari). Hardcoding a viewport here would override those
 * projects and test one size instead of all five — the mobile
 * coverage the project rules require comes from the project matrix,
 * not from this file.
 *
 * A NOTE ON ROUTE CHOICE:
 * The body/font/motion assertions run against "/" because they only
 * touch <body> and <h1>, which are stable regardless of what the home
 * route renders inside them. The focus-ring assertion deliberately
 * uses /admin/login instead: it needs a real form control, and the
 * home route is expected to change (an address-entry form is planned).
 * Anchoring a design-system test to a route whose contents are in
 * flux would make it fail for reasons that have nothing to do with
 * the design system.
 * ============================================================
 */

/** Expected computed value of --color-body-bg (#0000cc). */
const BODY_BG_RGB = "rgb(0, 0, 204)";

/** Expected computed value of --color-blue (#0000cc), used by the focus ring. */
const FOCUS_RING_RGB = "rgb(0, 0, 204)";

/**
 * Parse a CSS time value ("0.3s", "300ms", "1e-05s", "0.00001s") into
 * milliseconds.
 *
 * WHY THIS EXISTS: browsers do NOT agree on how to serialize a
 * computed transition-duration. For the same `0.01ms` declaration,
 * Chromium reports "1e-05s" while Firefox and WebKit report
 * "0.00001s" — all three are the same value, expressed differently.
 * An earlier version of this file compared the string directly and
 * failed on all five browser projects for a purely cosmetic reason.
 * Comparing parsed numbers tests the actual behavior instead of the
 * serialization format.
 *
 * Note the ms check comes first: "ms" also ends in "s", so testing
 * for "s" first would mis-parse every millisecond value.
 */
function parseCssTimeToMs(value: string): number {
  const trimmed = value.trim();

  if (trimmed.endsWith("ms")) {
    return parseFloat(trimmed);
  }
  if (trimmed.endsWith("s")) {
    return parseFloat(trimmed) * 1000;
  }
  return parseFloat(trimmed);
}

/**
 * Inject a probe element carrying a real transition, and return its
 * computed transition-duration in milliseconds.
 *
 * WHY A PROBE INSTEAD OF READING <body>: <body> declares no
 * transition, so its computed duration is 0s by default. Asserting
 * "body's duration is not 0.01ms" therefore passes whether or not
 * the reduced-motion rule exists at all — a vacuous test that would
 * have gone green forever while enforcing nothing. The probe declares
 * `transition: opacity 300ms` so there is a non-zero baseline for the
 * media query to actually override, which makes both the positive and
 * the negative assertion meaningful.
 *
 * The element is removed before returning so no test leaves state
 * behind for the next one.
 */
async function measureProbeTransitionMs(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.transition = "opacity 300ms ease";
    document.body.appendChild(probe);

    const duration = getComputedStyle(probe).transitionDuration;

    probe.remove();
    return duration;
  }).then(parseCssTimeToMs);
}

test.describe("Design tokens — computed styles (GLPDX-127 / GLPDX-170)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("applies --color-body-bg to the page background", async ({ page }) => {
    // Reads the *computed* value, not the declared one — this proves
    // the custom property actually resolved. If --color-body-bg were
    // deleted, CSS would treat background-color as invalid and fall
    // back to transparent, which this assertion would catch.
    const background = await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(background).toBe(BODY_BG_RGB);
  });

  test("uses the body font stack for body text, not the display font", async ({
    page,
  }) => {
    const fontFamily = await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).fontFamily);

    // Verdana leads --font-body. The negative assertion is the more
    // important half: Comic Sans / Comic Neue as body copy is the
    // specific mistake the display-only constraint exists to prevent.
    expect(fontFamily).toContain("Verdana");
    expect(fontFamily).not.toContain("Comic");
  });

  test("uses the display font for headings", async ({ page }) => {
    const fontFamily = await page
      .locator("h1")
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily);

    // Matches either "Comic Neue" (self-hosted, GLPDX-159) or the
    // "Comic Sans MS" fallback, so this doesn't fail on a machine
    // where the self-hosted file didn't load.
    expect(fontFamily).toContain("Comic");
  });
});

test.describe("Design tokens — focus ring (GLPDX-127 / GLPDX-170)", () => {
  test("renders a visible focus ring in the brand color", async ({ page }) => {
    // /admin/login is used rather than "/" because it has a stable
    // form control to focus. See the route-choice note at the top of
    // this file. No authentication is needed — the login form itself
    // is public; only /admin behind it is guarded.
    await page.goto("/admin/login");

    const firstTextbox = page.getByRole("textbox").first();
    await firstTextbox.focus();

    const outline = await firstTextbox.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        width: computed.outlineWidth,
        style: computed.outlineStyle,
        color: computed.outlineColor,
      };
    });

    // Text inputs match :focus-visible on any focus, per spec — so
    // calling .focus() here is a reliable way to exercise the same
    // rule a keyboard user hits, without depending on per-browser
    // Tab-order heuristics (WebKit in particular differs from
    // Chromium on which elements Tab reaches by default).
    expect(outline.style).not.toBe("none");
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
    expect(outline.color).toBe(FOCUS_RING_RGB);
  });
});

test.describe("Design tokens — reduced motion (GLPDX-127 / GLPDX-170)", () => {
  test("neutralizes transitions when the user prefers reduced motion", async ({
    page,
  }) => {
    // emulateMedia sets the prefers-reduced-motion media feature the
    // same way an OS-level "reduce motion" setting would, so the
    // global media query in global.css is genuinely exercised rather
    // than assumed.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const durationMs = await measureProbeTransitionMs(page);

    // global.css sets transition-duration to 0.01ms !important under
    // this preference. Asserting "effectively instant" rather than an
    // exact float keeps this from breaking if that sentinel value is
    // ever tuned (0.01ms vs 0.001ms is not a behavioral difference).
    expect(durationMs).toBeLessThan(1);
  });

  test("does not neutralize transitions by default", async ({ page }) => {
    // The counterpart to the test above. Without this, a rule that
    // *always* zeroed transitions — regardless of preference — would
    // pass the reduced-motion test while silently breaking every
    // animation in the app for everyone.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const durationMs = await measureProbeTransitionMs(page);

    // The probe declares 300ms, so anything close to that means the
    // reduced-motion override correctly did NOT apply here.
    expect(durationMs).toBeCloseTo(300, 0);
  });
});