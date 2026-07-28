import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
// to Cloudflare. We render simple stand-in buttons that call each of the
// three callbacks InquiryForm actually wires up (onSuccess, onExpire,
// onError), letting tests simulate all three widget outcomes without a
// real challenge. Cloudflare provides real dummy sitekeys for this same
// purpose in Playwright/E2E, but for a component test this mock is
// simpler and faster.
//
// GLPDX-169: originally this mock only exposed onSuccess. onExpire and
// onError were added specifically because InquiryForm passes
// `() => setTurnstileToken(null)` to both — logic that was previously
// unreachable from any test, since nothing could trigger those callbacks.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({
    onSuccess,
    onExpire,
    onError,
  }: {
    onSuccess: (token: string) => void;
    onExpire: () => void;
    onError: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSuccess("fake-turnstile-token")}>
        Mock Turnstile Widget
      </button>
      <button type="button" onClick={onExpire}>
        Mock Turnstile Expire
      </button>
      <button type="button" onClick={onError}>
        Mock Turnstile Error
      </button>
    </div>
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

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await user.click(submitButton);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("returns early from onSubmit without calling mutate when the form is submitted directly with no token", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    await user.type(screen.getByLabelText(/business name/i), "Pink Dog Carts");
    await user.type(screen.getByLabelText(/contact email/i), "owner@pinkdogcarts.com");
    await user.type(screen.getByLabelText(/message/i), "We'd love to be listed!");

    const form = screen.getByLabelText(/business name/i).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
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

  // GLPDX-169: closes a branch gap that only became visible once
  // everything else in this file was covered. The malformed-email test
  // above exercises this exact conditional-error-message pattern for
  // contactEmail; this does the same for businessName's required-field
  // validation, which had never been triggered by any existing test.
  it("shows a validation message and does not call mutate when business name is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    // Deliberately leave business name blank — fill only the other two
    // required fields.
    await user.type(screen.getByLabelText(/contact email/i), "owner@pinkdogcarts.com");
    await user.type(screen.getByLabelText(/message/i), "We'd love to be listed!");
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await user.click(submitButton);

    expect(await screen.findByText(/business name is required/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // GLPDX-169: same branch-gap closure as above, for the message field's
  // required-field validation instead of businessName's.
  it("shows a validation message and does not call mutate when message is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    // Deliberately leave message blank — fill only the other two
    // required fields.
    await user.type(screen.getByLabelText(/business name/i), "Pink Dog Carts");
    await user.type(screen.getByLabelText(/contact email/i), "owner@pinkdogcarts.com");
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await user.click(submitButton);

    expect(await screen.findByText(/message is required/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows a 'we got it' confirmation message when isSuccess is true", () => {
    mockHookState.isSuccess = true;
    renderWithProviders(<InquiryForm />);

    expect(screen.getByText(/we got it/i)).toBeInTheDocument();
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

  it("disables the submit button again if the Turnstile token expires", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    await user.click(screen.getByRole("button", { name: /mock turnstile expire/i }));

    await waitFor(() => expect(submitButton).toBeDisabled());
  });

  it("disables the submit button again if Turnstile reports an error", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InquiryForm />);

    const submitButton = screen.getByRole("button", { name: /submit/i });
    await user.click(screen.getByRole("button", { name: /mock turnstile widget/i }));
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    await user.click(screen.getByRole("button", { name: /mock turnstile error/i }));

    await waitFor(() => expect(submitButton).toBeDisabled());
  });
});