import { defineConfig, devices } from "@playwright/test";

// Playwright config for end-to-end tests. Separate from Vitest —
// Vitest tests components in isolation (jsdom, no real browser);
// Playwright drives a REAL browser against the actual running app,
// testing full user flows end to end.
//
// This tests against a local PRODUCTION build (pnpm build + pnpm preview),
// not the dev server — dev mode has different behavior (HMR, unminified
// code, different error overlays) that can mask or fake bugs. Testing the
// real build is closer to what a user actually gets.
//
// NOT testing against a real Cloudflare Pages deployment (yet). Cloudflare
// hosting isn't set up for this project at all yet — that's tracked as its
// own future Jira ticket, since wiring up real preview-deployment E2E needs
// a deploy step in CI and a Cloudflare API token, not just a config change
// here. Revisit this file when that ticket lands.
export default defineConfig({
  // E2E test files will live in e2e/ at the project root, kept separate
  // from src/ since these test the built app as a whole, not individual
  // components — they don't belong "alongside" any single piece of code.
  testDir: "./e2e",

  // Playwright's default reporter changes based on environment: locally
  // it's an interactive list view, but in CI (process.env.CI === "true")
  // it silently switches to a minimal "dot" reporter that produces NO
  // html report folder at all. Our CI workflow tries to upload
  // playwright-report/ as an artifact regardless — without explicitly
  // forcing the html reporter here, that upload step finds nothing.
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],

  // Runs the production build + preview server automatically before the
  // test suite and tears it down after, so you don't have to remember to
  // build/serve yourself before running E2E tests. Vite's preview server
  // defaults to port 4173 (different from dev's 5173) — that's Vite's
  // own default, not something we chose, but worth knowing so it doesn't
  // look like a typo.
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    // Build + preview startup takes longer than just starting the dev
    // server — give it more room than Playwright's default timeout
    // before deciding the server failed to come up.
    timeout: 120 * 1000,
  },

  use: {
    baseURL: "http://localhost:4173",
    // Captures a screenshot + trace only on failure, so failing CI runs
    // are debuggable without bloating storage on every passing run.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // Per project rules: E2E tests must cover mobile viewport sizes, and
  // must run against Chromium, Firefox, and WebKit (which covers Brave,
  // since Brave is Chromium-based and the privacy-hardening it adds is
  // what we specifically need to verify against).
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});