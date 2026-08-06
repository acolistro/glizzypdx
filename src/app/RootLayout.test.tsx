import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RootLayout } from "./RootLayout";

// RootLayout is the app-wide page chrome (marquee header, nav, hit
// counter, webring footer — see GLPDX-144) that wraps whatever page
// content the router decides to render. It's a plain presentational
// component (just takes `children`), NOT wired to the router directly.
// That's a deliberate choice: it means these tests can verify "does the
// shell wrap content correctly" without needing a real router, a route
// tree, or any TanStack Router setup at all. The actual router wiring —
// swapping `children` for TanStack Router's `<Outlet />` — is tested
// separately in app/router.test.tsx.
//
// We test for landmark ROLES (banner / main / contentinfo) rather than
// exact copy or markup, since the header/footer content itself (marquee
// text, hit counter number, webring links) isn't decided yet. Testing
// structure now and content later keeps this test from becoming brittle
// the moment real copy gets written in.
describe("RootLayout", () => {
  it("renders a banner landmark for the page header chrome", () => {
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders a main landmark that contains whatever children are passed in", () => {
    render(
      <RootLayout>
        <p>Unique marker content for this test</p>
      </RootLayout>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Unique marker content for this test");
  });

  it("renders a contentinfo landmark for the page footer chrome", () => {
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders a single top-level heading identifying the site", () => {
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    // Every page should have exactly one <h1> — this locks that in as
    // part of RootLayout's contract, rather than leaving it to chance
    // per-page. Matches what e2e/smoke.spec.ts (GLPDX-1) already checks
    // for in a real browser.
    expect(
      screen.getByRole("heading", { level: 1, name: /glizzypdx/i }),
    ).toBeInTheDocument();
  });

  it("renders the mobile full-bleed accent stripe as a decorative, non-semantic element (GLPDX-171)", () => {
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    // This element has no ARIA role (it's aria-hidden and purely
    // decorative — see RootLayout.tsx's comment), so it can't be
    // covered incidentally by the landmark tests above the way most of
    // RootLayout's structure is. Its actual visual behavior (hidden on
    // desktop, visible below 600px, correct height/color) is a browser
    // computed-style concern and is covered separately in
    // e2e/design-tokens.spec.ts — this test only locks in that the
    // element exists and is correctly marked decorative, which jsdom
    // can verify without a real browser.
    const accent = screen.getByTestId("mobile-bottom-accent");
    expect(accent).toBeInTheDocument();
    expect(accent).toHaveAttribute("aria-hidden", "true");
  });
});