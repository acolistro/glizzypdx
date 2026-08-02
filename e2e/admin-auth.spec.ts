import { test, expect } from "@playwright/test";
import { stubTurnstile } from "./helpers/turnstile";

/**
 * E2E tests for GLPDX-124: admin authentication and access control.
 *
 * Covers the routing/auth behaviour built in GLPDX-82 (login form +
 * useAdminLogin), GLPDX-83 (route guard), and GLPDX-85 (silent
 * redirect) -- specifically the parts that only a real browser against
 * a real Supabase instance can prove. The Vitest suite already covers
 * these units in isolation; what's new here is the whole chain running
 * for real: form -> Supabase Auth -> session in the browser ->
 * TanStack Router's beforeLoad guard reading that session -> navigation.
 *
 * PREREQUISITES (this suite fails without them):
 * 1. Local Supabase running (`supabase start`).
 * 2. The local admin account seeded:
 *      node --env-file=.env.local --import tsx scripts/admin/seed-local-admin.ts
 *    `supabase db reset` wipes it -- rerun the seed after any reset.
 * 3. `[auth.captcha]` configured in supabase/config.toml (enabled,
 *    provider "turnstile", Cloudflare's dummy always-passing secret).
 *    Without it, GoTrue ignores the captchaToken entirely rather than
 *    validating it.
 *
 * Turnstile is stubbed via stubTurnstile() -- see e2e/helpers/turnstile.ts
 * for why the real widget can't be driven in an automated browser. The
 * stub supplies a fake token; Supabase then validates that token
 * server-side against Cloudflare's dummy secret, which accepts any
 * token by design.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT PROVE: because that dummy
 * secret always passes, a green run here cannot distinguish "captcha
 * was enforced and passed" from "captcha was silently ignored." Both
 * look identical from the outside. Proving enforcement is real needs a
 * one-off manual check against Cloudflare's always-FAILS testing
 * secret (2x0000000000000000000000000000000AA) -- swap it into
 * config.toml, restart, confirm login is rejected, then swap back. Not
 * automatable in a single stack run, so it isn't a test here.
 */

// Credentials for the seeded local admin account. Defaults mirror
// seed-local-admin.ts's own fallbacks, so the common case (no env vars
// set anywhere) still works without configuration drift between the
// seeder and the test that depends on it.
const ADMIN_EMAIL = process.env.LOCAL_ADMIN_EMAIL ?? "local-admin@glizzypdx.test";
const ADMIN_PASSWORD =
  process.env.LOCAL_ADMIN_PASSWORD ?? "Local-Admin-Test-Password-123!";

test.describe("Admin authentication", () => {
  test.beforeEach(async ({ page }) => {
    await stubTurnstile(page);
  });

  test("logs in with valid admin credentials and lands on /admin", async ({
    page,
  }) => {
    await page.goto("/admin/login");

    await page.getByLabel(/^email$/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);

    // The submit button stays disabled until Turnstile produces a
    // token, so waiting for it to enable is how we know the stubbed
    // widget's callback has fired -- no arbitrary timeout needed.
    const submitButton = page.getByRole("button", { name: /log in/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });

    await submitButton.click();

    // AdminLoginForm navigates via useEffect on login.isSuccess, so
    // the URL change is the real signal that the whole chain worked:
    // signInWithPassword succeeded, the session's role was "admin"
    // (useAdminLogin signs out non-admins and throws), and the
    // /admin/_authenticated guard let the session through.
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10_000 });
  });

  test("shows a generic error and stays on /admin/login with a wrong password", async ({
    page,
  }) => {
    await page.goto("/admin/login");

    await page.getByLabel(/^email$/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill("Definitely-Not-The-Password-1!");

    const submitButton = page.getByRole("button", { name: /log in/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    // The error banner carries role="alert" and an explicit
    // aria-label, so targeting it by role is both the accessible path
    // and the stable one (it doesn't couple this test to the exact
    // wording of the message).
    await expect(page.getByRole("alert", { name: /login failed/i })).toBeVisible(
      { timeout: 10_000 },
    );

    // Must NOT have navigated -- a failed login that still lands on
    // /admin would be the exact bug this whole ticket exists to
    // prevent.
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("redirects an unauthenticated visitor away from /admin", async ({
    page,
  }) => {
    // No login step at all -- this is a cold, sessionless visit.
    await page.goto("/admin");

    // GLPDX-85: redirect silently to "/" rather than showing an error
    // or a "you must log in" interstitial, which would confirm to a
    // prober that /admin exists and is worth attacking.
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  });

  test("keeps the admin session across a page reload", async ({ page }) => {
    await page.goto("/admin/login");

    await page.getByLabel(/^email$/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);

    const submitButton = page.getByRole("button", { name: /log in/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10_000 });

    // A reload re-runs beforeLoad from scratch against whatever
    // Supabase persisted, rather than against in-memory React state.
    // This is the case that catches a guard which only works because
    // the session happened to still be in memory from the login that
    // just happened.
    await page.reload();

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10_000 });
  });
});

/**
 * BLOCKED, not forgotten: GLPDX-124's description also calls for an
 * E2E case confirming a vendor account with valid credentials still
 * can't reach /admin. That can't be written yet -- vendor auth
 * (GLPDX-48 / GLPDX-50) is still To Do, so there is no vendor account
 * to authenticate as. useAdminLogin's non-admin path IS covered at the
 * unit level (it signs the session back out and throws a generic
 * error); this is specifically the missing end-to-end proof.
 *
 * Add here once vendor auth lands.
 */