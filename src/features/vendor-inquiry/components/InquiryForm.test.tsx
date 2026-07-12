import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { InquiryForm } from "./InquiryForm";

// Mock the hook entirely — this component test is only concerned with
// form behavior (validation, disabled states, calling mutate with the
// right shape), not with re-testing useVendorInquiry's internals, which
// already has its own test file.
const mockMutate = vi.fn();
let mockHookState = {
  mutate: mockMutate,
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as Error | null,
};

vi.mock("../hooks/useVendorInquiry", () => ({
  useVendorInquiry: () => mockHookState,
}));

// Mock the Turnstile widget so tests don't depend on a live network call
// to Cloudflare. We render a simple stand-in button that calls onSuccess
// with a fake token, letting tests simulate "user completed the captcha"
// without a real challenge. Cloudflare provides real dummy sitekeys for
// this same purpose in Playwright/E2E, but for a component test this
// mock is simpler and faster.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess("fake-turnstile-token")}>
      Mock Turnstile Widget
    </button>
  ),
}));

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("InquiryForm", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockHookState = {
      mutate: mockMutate,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    };
  });

  it("renders business name, contact email, and message fields", () => {
    renderWithProviders(<InquiryForm />);

    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
  });

  it("keeps the submit button disabled until the Turnstile widget succeeds", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    const submitButton = screen.getByRole("button", { name: /submit/i });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));

    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });

  it("does not call mutate if the form is submitted without a Turnstile token", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    await user.type(screen.getByLabelText(/business name/i), "Pink Dog Carts");
    await user.type(screen.getByLabelText(/contact email/i), "owner@pinkdogcarts.com");
    await user.type(screen.getByLabelText(/message/i), "We'd love to be listed!");

    // Submit button should still be disabled since Turnstile was never completed —
    // clicking a disabled button is a no-op, confirming the guard actually works
    // rather than just trusting the disabled attribute exists.
    const submitButton = screen.getByRole("button", { name: /submit/i });
    await user.click(submitButton);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls mutate with form values and the Turnstile token on valid submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    await user.type(screen.getByLabelText(/business name/i), "Pink Dog Carts");
    await user.type(screen.getByLabelText(/contact email/i), "owner@pinkdogcarts.com");
    await user.type(screen.getByLabelText(/message/i), "We'd love to be listed!");
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await user.click(submitButton);

    expect(mockMutate).toHaveBeenCalledWith({
      businessName: "Pink Dog Carts",
      contactEmail: "owner@pinkdogcarts.com",
      message: "We'd love to be listed!",
      turnstileToken: "fake-turnstile-token",
    });
  });

  it("shows a validation message and does not call mutate when contact email is malformed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    await user.type(screen.getByLabelText(/business name/i), "Pink Dog Carts");
    await user.type(screen.getByLabelText(/contact email/i), "not-an-email");
    await user.type(screen.getByLabelText(/message/i), "We'd love to be listed!");
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await user.click(submitButton);

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows a 'we got it' confirmation message when isSuccess is true", () => {
    mockHookState.isSuccess = true;
    renderWithProviders(<InquiryForm />);

    expect(screen.getByText(/we got it/i)).toBeInTheDocument();
    // Form fields should no longer be rendered once we're showing the
    // success state — confirms these are mutually exclusive views, not
    // a confirmation message just appended above a still-visible form.
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });

  it("shows an error message when isError is true, and leaves the form visible so the user can retry", () => {
    mockHookState.isError = true;
    mockHookState.error = new Error("Failed to fetch");
    renderWithProviders(<InquiryForm />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
  });

  it("disables the submit button while the mutation is pending", () => {
    mockHookState.isPending = true;
    renderWithProviders(<InquiryForm />);

    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });
});