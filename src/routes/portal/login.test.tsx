import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginPage } from "./-LoginPage";
import { Route } from "./login";

vi.mock(
  "../../features/vendor-portal/components/VendorLoginForm",
  () => ({
    VendorLoginForm: () => <div data-testid="mock-vendor-login-form" />,
  }),
);

describe("LoginPage (portal/login route)", () => {
  it("renders a page heading and the vendor login form", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: /vendor login/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-vendor-login-form")).toBeInTheDocument();
  });
});

describe("portal/login route registration (src/routes/portal/login.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});