import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// -----------------------------------------------------------------------
// WHAT THIS FILE TESTS
// -----------------------------------------------------------------------
// AdminHomePage is the actual page content shown at /admin once a
// visitor has passed the guard in admin/route.tsx. It's pulled into its
// own dash-prefixed file (a convention already established in this repo
// with src/routes/-HomePage.tsx) specifically so TanStack Router's file-
// based routing does NOT treat it as a route file — the leading `-`
// tells the router plugin to ignore it. That means this is just a plain
// React component, testable the normal Testing Library way, with none
// of the file-route-object friction documented in GLPDX-169's handoff.
//
// This is intentionally a thin placeholder for now — GLPDX-86/88/89/93
// (the vendor approval flow) hasn't been built yet, so there's no real
// admin dashboard content to render. This test just confirms the page
// renders something recognizable, so we know the wiring in
// admin/index.tsx -> -AdminHomePage.tsx is correct.
// -----------------------------------------------------------------------

import { AdminHomePage } from "./-AdminHomePage";

describe("AdminHomePage", () => {
  it("renders an 'Admin' heading", () => {
    render(<AdminHomePage />);

    // getByRole with the "heading" role is more resilient than
    // getByText -- it fails clearly if the markup changes from an <h1>
    // to something non-semantic, which text-only queries wouldn't catch.
    expect(
      screen.getByRole("heading", { name: "Admin" }),
    ).toBeInTheDocument();
  });
});