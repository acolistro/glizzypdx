import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RootLayout } from "./RootLayout";

// RootLayout is the app-wide GeoCities page chrome (marquee banner, tiled
// background, hit counter, webring footer — see GLPDX-144) that wraps
// whatever page content the router decides to render. It's a plain
// presentational component (just takes `children`), NOT wired to the
// router directly. That's a deliberate choice: it means these tests can
// verify "does the shell wrap content correctly" without needing a real
// router, a route tree, or any TanStack Router setup at all. The actual
// router wiring — swapping `children` for TanStack Router's `<Outlet />`
// — is tested separately in app/router.test.tsx.
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
});