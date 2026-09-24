import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalHomePage } from "./-PortalHomePage";
import { Route } from "./index";

describe("PortalHomePage (portal index route)", () => {
  it("renders a placeholder heading confirming the vendor is logged in", () => {
    render(<PortalHomePage />);

    expect(
      screen.getByRole("heading", { level: 2, name: /vendor portal/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/logged in/i)).toBeInTheDocument();
  });
});

describe("portal index route registration (src/routes/portal/index.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});