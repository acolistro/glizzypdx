import { test, expect } from "@playwright/test";

/**
 * design-tokens.spec.ts — Design system browser behavior
 * (GLPDX-127 / GLPDX-170 / GLPDX-171)
 * ============================================================
 * WHAT THIS FILE TESTS:
 * The parts of the design token system that only a real browser can
 * verify — computed styles, font resolution, focus indicators, the
 * page wrapper's border/outline/full-bleed behavior, and the
 * reduced-motion media query. The *static* guarantees (tokens exist,
 * no raw hex or raw border-width escapes into components) are covered
 * separately in src/styles/tokens.test.ts, which is much faster and
 * doesn't need a browser.
 *
 * WHY A SEPARATE FILE FROM smoke.spec.ts:
 * smoke.spec.ts answers exactly one question — "did the app boot?"
 * Keeping design-system assertions out of it means a smoke failure
 * still has an unambiguous meaning. Mixing them would turn every
 * styling regression into a "smoke test failed" alarm.
 *
 * WHY NO EXPLICIT VIEWPORT ON MOST TESTS:
 * playwright.config.ts already runs every spec across five projects
 * (chromium/firefox/webkit desktop, plus mobile-chrome and
 * mobile-safari). Hardcoding a viewport would override those projects
 * and test one size instead of all five — the mobile coverage the
 * project rules require comes from the project matrix, not from this
 * file. The page-wrapper tests below are the exception: they need
 * specific widths (desktop-wide, the 600–920px gap, and mobile) to
 * exercise distinct CSS breakpoints, so those explicitly call
 * setViewportSize regardless of which project is running.
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

/** Expected computed rgb() for --color-yellow (#ffdd00), used by the page wrapper. */
const WRAPPER_BORDER_YELLOW_RGB = "rgb(255, 221, 0)";

/** Expected computed rgb() for --color-red (#cc0000), used by the page wrapper. */
const WRAPPER_OUTLINE_RED_RGB = "rgb(204, 0, 0)";

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

test.describe("Design tokens — page wrapper (GLPDX-171)", () => {
  test("renders the yellow border and red outline at desktop widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const wrapper = page.getByTestId("page-wrapper");

    // Longhand properties, not the border/outline shorthand — WebKit
    // and other browsers serialize shorthand computed styles
    // inconsistently, but longhand width/color/style properties are
    // stable across all five projects.
    const styles = await wrapper.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        borderTopWidth: computed.borderTopWidth,
        borderTopColor: computed.borderTopColor,
        borderTopStyle: computed.borderTopStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        outlineStyle: computed.outlineStyle,
      };
    });

    expect(styles.borderTopWidth).toBe("5px");
    expect(styles.borderTopColor).toBe(WRAPPER_BORDER_YELLOW_RGB);
    expect(styles.borderTopStyle).toBe("solid");
    expect(styles.outlineWidth).toBe("4px");
    expect(styles.outlineColor).toBe(WRAPPER_OUTLINE_RED_RGB);
    expect(styles.outlineStyle).toBe("solid");
  });

  test("does not exceed 920px and stays horizontally centered on wide viewports", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/");

    const wrapper = page.getByTestId("page-wrapper");
    const box = await wrapper.boundingBox();
    if (!box) throw new Error("page-wrapper has no bounding box");

    expect(box.width).toBeLessThanOrEqual(920);

    // Centered means left and right margins are equal, within a small
    // tolerance for subpixel rounding.
    const rightMargin = 1400 - (box.x + box.width);
    expect(Math.abs(box.x - rightMargin)).toBeLessThan(2);
  });

  test("does not cause horizontal overflow at widths between the mobile breakpoint and 920px", async ({
    page,
  }) => {
    // Regression test: outline always paints outside the border box
    // regardless of box-sizing, and margin-inline:auto only creates
    // space once the box is narrower than its cap. Without an explicit
    // safety margin, ANY viewport under ~928px — not just viewports
    // under the mobile breakpoint — would clip or scroll on this 4px
    // outline. None of the five configured Playwright projects land in
    // this gap by default (desktop projects default wider, mobile
    // projects default narrower), so this test sets the viewport
    // explicitly or the regression would go undetected by the rest of
    // the suite.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto("/");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("goes full-bleed with a two-tone bottom accent below the mobile breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");

    const wrapper = page.getByTestId("page-wrapper");

    const wrapperStyles = await wrapper.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        width: element.getBoundingClientRect().width,
        marginLeft: computed.marginLeft,
        marginRight: computed.marginRight,
        outlineStyle: computed.outlineStyle,
        borderTopStyle: computed.borderTopStyle,
        borderBottomWidth: computed.borderBottomWidth,
        borderBottomColor: computed.borderBottomColor,
        borderBottomStyle: computed.borderBottomStyle,
      };
    });

    // Full-bleed: fills the viewport, no margin, no outline, no
    // top/side border — only the bottom accent remains.
    expect(wrapperStyles.width).toBe(375);
    expect(wrapperStyles.marginLeft).toBe("0px");
    expect(wrapperStyles.marginRight).toBe("0px");
    expect(wrapperStyles.outlineStyle).toBe("none");
    expect(wrapperStyles.borderTopStyle).toBe("none");
    expect(wrapperStyles.borderBottomWidth).toBe("5px");
    expect(wrapperStyles.borderBottomColor).toBe(WRAPPER_BORDER_YELLOW_RGB);
    expect(wrapperStyles.borderBottomStyle).toBe("solid");

    // The red stripe is a real element, not outline/box-shadow — see
    // RootLayout.module.css's .mobileAccent comment for why. Assert it
    // directly rather than inferring it from the wrapper's styles.
    const accent = page.getByTestId("mobile-bottom-accent");
    const accentStyles = await accent.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        display: computed.display,
        height: computed.height,
        backgroundColor: computed.backgroundColor,
        width: element.getBoundingClientRect().width,
      };
    });

    expect(accentStyles.display).not.toBe("none");
    expect(accentStyles.height).toBe("4px");
    expect(accentStyles.backgroundColor).toBe(WRAPPER_OUTLINE_RED_RGB);
    expect(accentStyles.width).toBe(375);
  });

  test("hides the mobile accent stripe at desktop widths", async ({ page }) => {
    // The counterpart to the test above — without this, a rule that
    // showed the accent stripe unconditionally would pass the mobile
    // test while leaving a stray red line on every desktop pageview.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const display = await page
      .getByTestId("mobile-bottom-accent")
      .evaluate((element) => getComputedStyle(element).display);

    expect(display).toBe("none");
  });
});

test.describe("Design tokens — tagline font (GLPDX-171)", () => {
  test("uses the body font for the tagline, not the inherited display font", async ({
    page,
  }) => {
    await page.goto("/");

    const fontFamily = await page
      .locator("p")
      .filter({ hasText: /hotdog carts/i })
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily);

    // The negative assertion is the one that actually catches the bug:
    // .tagline inherits font-family from its parent .marquee unless it
    // sets its own. Before the fix, this would contain "Comic" instead.
    expect(fontFamily).toContain("Verdana");
    expect(fontFamily).not.toContain("Comic");
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