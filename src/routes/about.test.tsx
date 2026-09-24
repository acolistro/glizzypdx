import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AboutPage } from "./-AboutPage";
import { Route } from "./about";

describe("AboutPage (about route)", () => {
  it("renders a page heading identifying the About page", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: /about glizzypdx/i }),
    ).toBeInTheDocument();
  });

  it("states the no-accounts, no-tracking privacy stance", () => {
    render(<AboutPage />);

    expect(
      screen.getByText(/without asking you to create an account/i),
    ).toBeInTheDocument();
  });

  it("explains vendor-controlled visibility (manual check-in, opt-in last-known)", () => {
    render(<AboutPage />);

    expect(screen.getByText(/manually checks in/i)).toBeInTheDocument();
  });
});

describe("about route registration (src/routes/about.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});