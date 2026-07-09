import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

// See NOTE below re: GLPDX-129/GLPDX-144 for why this smoke test now
// needs a QueryClientProvider and a mocked Turnstile widget — neither
// was necessary before App started temporarily mounting InquiryForm.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: () => <div>Mock Turnstile Widget</div>,
}));

// This is a smoke test — it just proves the component renders without
// throwing and that its key text is present. It exists mainly to verify
// the TESTING PIPELINE ITSELF works (Vitest + jsdom + React Testing
// Library all wired together correctly via vite.config.ts), which is
// part of what GLPDX-1 (bootstrap) needs to prove out.
//
// Real, meaningful tests get written alongside each feature as it's
// built (per project rules: every story has a matching test ticket).
//
// NOTE (GLPDX-129): App now temporarily mounts InquiryForm as a
// placeholder (see GLPDX-144) so it can be manually/E2E tested before
// real routing exists. InquiryForm uses useVendorInquiry (needs a
// QueryClientProvider) and renders the real Turnstile widget, which
// tries to load Cloudflare's script and update state outside act() if
// left unmocked here — so both are handled the same way InquiryForm's
// own test file already does. This wrapper/mock (and the placeholder
// mount in App.tsx) should be removed once GLPDX-144 replaces App with
// real routing.
describe("App", () => {
  it("renders the GlizzyPDX heading", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: /glizzypdx/i }),
    ).toBeInTheDocument();
  });
});