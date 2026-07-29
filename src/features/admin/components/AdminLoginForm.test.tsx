import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// -----------------------------------------------------------------------
// WHAT THIS FILE TESTS
// -----------------------------------------------------------------------
// The admin login form itself. Mirrors InquiryForm.test.tsx's approach:
// mock the Turnstile widget (it detects headless browsers and won't
// render for real even with a dummy sitekey -- see this project's
// standing testing notes) and mock useAdminLogin so we control
// success/failure without a real Supabase call.
//
// This form has NO vendor-inquiry CTA (unlike the future vendor login
// page) -- admin is single-owner-only, confirmed in chat and in
// GLPDX-82's description. That absence is asserted explicitly below so
// a future edit can't accidentally reintroduce it.
// -----------------------------------------------------------------------

const mockMutate = vi.fn();
let mockMutationState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
};

vi.mock("../hooks/useAdminLogin", () => ({
  useAdminLogin: () => ({
    mutate: mockMutate,
    ...mockMutationState,
  }),
}));

// Same Turnstile-stubbing approach as InquiryForm.test.tsx: render a
// simple fake widget with buttons that let individual tests trigger
// onSuccess/onExpire/onError directly, since the real widget refuses to
// render under Playwright/jsdom.
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
    <div data-testid="turnstile-mock">
      <button onClick={() => onSuccess("fake-turnstile-token")}>
        Simulate Turnstile success
      </button>
      <button onClick={onExpire}>Simulate Turnstile expire</button>
      <button onClick={onError}>Simulate Turnstile error</button>
    </div>
  ),
}));

// AdminLoginForm navigates via TanStack Router's useNavigate() on
// successful login. The real hook needs actual router context to work,
// which this test environment doesn't set up (no RouterProvider) -- so
// it's mocked here, the same way Supabase and Turnstile are mocked
// above, purely so we can assert WHAT it was called with.
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

import { AdminLoginForm } from "./AdminLoginForm";

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminLoginForm />
    </QueryClientProvider>,
  );
}

describe("AdminLoginForm", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockNavigate.mockReset();
    mockMutationState = {
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    };
  });

  it("keeps the submit button disabled until the Turnstile widget succeeds", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    const submitButton = screen.getByRole("button", { name: /log in/i });
    expect(submitButton).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );

    expect(submitButton).not.toBeDisabled();
  });

  it("does not call mutate if submitted without a Turnstile token", async () => {
    renderWithQueryClient();

    // The submit button is disabled without a token, so we fire a native
    // submit event directly on the form -- same technique
    // InquiryForm.test.tsx uses, since clicking a disabled button is a
    // no-op and never reaches onSubmit at all.
    const form = screen.getByRole("button", { name: /log in/i }).closest("form")!;
    // async act, awaited: React Hook Form's internal validation resolves
    // as a microtask, so a synchronous act() exits before that state
    // update actually lands -- this is what the earlier act() warning
    // was pointing at.
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls mutate with email, password, and the Turnstile token on valid submit", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.type(screen.getByLabelText(/email/i), "arcolistro@gmail.com");
    await user.type(screen.getByLabelText(/password/i), "correct-horse-battery-staple");
    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        email: "arcolistro@gmail.com",
        password: "correct-horse-battery-staple",
        captchaToken: "fake-turnstile-token",
      }),
    );
  });

  it("shows a validation message and does not call mutate when email is empty", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.type(screen.getByLabelText(/password/i), "some-password");
    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email/i);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows a validation message and does not call mutate when password is empty", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.type(screen.getByLabelText(/email/i), "arcolistro@gmail.com");
    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/password/i);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows the generic error banner when the mutation fails", () => {
    mockMutationState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error("Invalid email or password."),
    };
    renderWithQueryClient();

    expect(screen.getByRole("alert", { name: /login failed/i })).toHaveTextContent(
      "Invalid email or password.",
    );
  });

  it("disables the submit button and shows pending text while the mutation is in flight", () => {
    mockMutationState = {
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
    };
    renderWithQueryClient();

    expect(screen.getByRole("button", { name: /logging in/i })).toBeDisabled();
  });

  it("does NOT render a vendor-inquiry call-to-action link", () => {
    renderWithQueryClient();

    // Explicit negative assertion: this form is single-owner-only, no
    // public onboarding path. See GLPDX-82's description and the CTA
    // link that DOES belong on the vendor login page instead (GLPDX-50).
    expect(
      screen.queryByRole("link", { name: /listed vendor/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates to /admin once the login mutation succeeds", () => {
    mockMutationState = {
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    };
    renderWithQueryClient();

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/admin" });
  });

  it("disables the submit button again if the Turnstile token expires after success", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    expect(screen.getByRole("button", { name: /log in/i })).not.toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /simulate turnstile expire/i }),
    );
    expect(screen.getByRole("button", { name: /log in/i })).toBeDisabled();
  });

  it("disables the submit button if the Turnstile widget errors after success", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    expect(screen.getByRole("button", { name: /log in/i })).not.toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /simulate turnstile error/i }),
    );
    expect(screen.getByRole("button", { name: /log in/i })).toBeDisabled();
  });
});