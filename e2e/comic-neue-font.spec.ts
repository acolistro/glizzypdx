import { test, expect } from '@playwright/test';

/**
 * GLPDX-159 regression test.
 *
 * What broke: --font-display fell through to a fallback font on
 * Android because none of the named fonts were actually available
 * on that OS. The fix was self-hosting Comic Neue via @font-face
 * instead of relying on the OS to have it installed.
 *
 * IMPORTANT — why this uses document.fonts.load(), not
 * document.fonts.ready: an earlier version of this test waited on
 * document.fonts.ready, which only resolves for fonts the page's
 * already-rendered content actually needs. That produced two bugs:
 * (1) the bold check failed on every browser, since nothing on this
 * page currently renders bold text, so the browser never had a
 * reason to fetch the bold file; (2) the regular check was flaky
 * across engines, since browsers differ in exactly when
 * fonts.ready resolves relative to the fetch actually completing.
 * document.fonts.load() sidesteps both: it actively triggers the
 * fetch for the exact family+weight given (whether or not anything
 * on the page currently uses it) and its promise only resolves once
 * that font is genuinely ready — deterministic, no race, no
 * dependency on what happens to be rendered at test time.
 */
test.describe('GLPDX-159: self-hosted Comic Neue font', () => {
  test('Comic Neue regular (400) loads successfully', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => document.fonts.load('16px "Comic Neue"'));

    const regularLoaded = await page.evaluate(() =>
      document.fonts.check('16px "Comic Neue"')
    );

    expect(regularLoaded).toBe(true);
  });

  test('Comic Neue bold (700) loads successfully', async ({ page }) => {
    await page.goto('/');

    // Explicitly requested even though nothing on the page renders
    // bold text right now — see the class-level comment above for why
    // that distinction matters.
    await page.evaluate(() => document.fonts.load('bold 16px "Comic Neue"'));

    const boldLoaded = await page.evaluate(() =>
      document.fonts.check('bold 16px "Comic Neue"')
    );

    expect(boldLoaded).toBe(true);
  });
});