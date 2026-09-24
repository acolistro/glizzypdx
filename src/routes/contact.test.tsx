import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactPage } from "./-ContactPage";
import { Route } from "./contact";

// Same two-describe-block pattern as about.test.tsx / faq.test.tsx.

describe("ContactPage (contact route)", () => {
  it("renders a page heading identifying the Contact page", () => {
    render(<ContactPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: /contact/i }),
    ).toBeInTheDocument();
  });

  it("renders the contact email as a mailto link", () => {
    render(<ContactPage />);

    const emailLink = screen.getByRole("link", { name: /alex@mallsoft\.love/i });
    expect(emailLink).toHaveAttribute("href", "mailto:alex@mallsoft.love");
  });

  // Exact copy per GLPDX-156/GLPDX-50 -- GLPDX-192 (GLPDX-50's paired
  // test) is the canonical source of truth for this string; this test
  // must match it exactly, per GLPDX-193's own note that a mismatch
  // here is a real bug, not a flake.
  it("renders the vendor CTA with the exact shared copy", () => {
    render(<ContactPage />);

    expect(
      screen.getByText(
        /don't have an account\? interested in becoming a listed vendor\?/i,
      ),
    ).toBeInTheDocument();
  });

  // TEMPORARY target: same interim pattern as -FaqPage.tsx (GLPDX-158).
  // /get-listed doesn't exist yet (GLPDX-157 not done), so this links
  // to "/" for now. Plain <a>, not TanStack's <Link>, since this page
  // is tested without a <RouterProvider>. Must become
  // <Link to="/get-listed"> once GLPDX-157 lands -- tracked there.
  it("links the vendor CTA to the inquiry form's current location", () => {
    render(<ContactPage />);

    const link = screen.getByRole("link", { name: /reach out here/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("does not present itself as the vendor onboarding form", () => {
    render(<ContactPage />);

    // GLPDX-156 explicitly scopes this page as general contact, not a
    // second inquiry form -- guards against someone later pasting
    // InquiryForm's fields in here by mistake.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

describe("contact route registration (src/routes/contact.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});