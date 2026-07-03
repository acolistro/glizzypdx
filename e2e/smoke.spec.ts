import { test, expect } from "@playwright/test";

// Like App.test.tsx, this is a smoke test for GLPDX-1 — it proves the
// Playwright pipeline itself works (launches a real browser, hits the
// dev server, finds rendered content) rather than testing real product
// behavior, which doesn't exist yet.
test("app boots and shows the GlizzyPDX heading", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /glizzypdx/i }),
  ).toBeVisible();
});
