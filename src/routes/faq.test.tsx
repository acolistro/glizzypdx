import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FaqPage } from "./-FaqPage";
import { Route } from "./faq";

describe("FaqPage (faq route)", () => {
  it("renders a page heading identifying the FAQ page", () => {
    render(<FaqPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: /frequently asked questions/i }),
    ).toBeInTheDocument();
  });

  it("renders separate sections for visitors and vendors", () => {
    render(<FaqPage />);

    expect(
      screen.getByRole("heading", { level: 3, name: /for visitors/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /for vendors/i }),
    ).toBeInTheDocument();
  });

    it("explains what the map pin colors mean", () => {
    render(<FaqPage />);

    expect(screen.getByText(/how does the map work/i)).toBeInTheDocument();
    expect(screen.getByText(/green pin/i)).toBeInTheDocument();
    expect(screen.getByText(/gray pin means/i)).toBeInTheDocument();
  });
  it("states the privacy stance (no accounts, no tracking)", () => {
    render(<FaqPage />);

    expect(screen.getByText(/is my visit tracked/i)).toBeInTheDocument();
    expect(
      screen.getByText(/without creating an account/i),
    ).toBeInTheDocument();
  });

  // TEMPORARY target: /get-listed doesn't exist yet (GLPDX-157 not done),
  // so this links to "/" -- where the vendor inquiry form currently
  // lives -- rather than the type-safe <Link to="/get-listed"> we'd
  // otherwise use (TanStack Router type-checks `to` against the real,
  // registered route tree, so pointing at an unregistered path would
  // fail tsc --build outright, not just look wrong). MUST be updated to
  // /get-listed once GLPDX-157 lands and moves the form off the home
  // route -- tracked as a follow-up note on GLPDX-158 and GLPDX-191.
  it("links to the vendor inquiry form's current location", () => {
    render(<FaqPage />);

    const link = screen.getByRole("link", { name: /get in touch/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("starts every question collapsed", () => {
    render(<FaqPage />);

    const allDetails = document.querySelectorAll("details");
    expect(allDetails.length).toBeGreaterThan(0);
    allDetails.forEach((details) => {
      expect(details).not.toHaveAttribute("open");
    });
  });

  it("opens a question's answer when its summary is clicked", async () => {
    const user = userEvent.setup();
    render(<FaqPage />);

    const summary = screen.getByText(/how does the map work/i);
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);

    expect(details).toHaveAttribute("open");
  });
});

describe("faq route registration (src/routes/faq.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});