import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mirrors AdminLoginForm.test.tsx's mocking approach exactly: mock the
// Turnstile widget (won't render for real in this environment) and
// mock useVendorLogin so we control success/failure without a real
// Supabase call. useNavigate is mocked the same way, for the same
// reason -- this component navigates on success, and the real hook
// needs router context this test environment doesn't set up.

const mockMutate = vi.fn();
let mockMutationState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
};

vi.mock("../hooks/useVendorLogin", () => ({
  useVendorLogin: () => ({
    mutate: mockMutate,
    ...mockMutationState,
  }),
}));

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

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

import { VendorLoginForm } from "./VendorLoginForm";

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VendorLoginForm />
    </QueryClientProvider>,
  );
}

describe("VendorLoginForm", () => {
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

    const form = screen.getByRole("button", { name: /log in/i }).closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls mutate with email, password, and the Turnstile token on valid submit", async () => {
    const user = userEvent.setup();
    renderWithQueryClient();

    await user.type(screen.getByLabelText(/email/i), "vendor@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct-horse-battery-staple");
    await user.click(
      screen.getByRole("button", { name: /simulate turnstile success/i }),
    );
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        email: "vendor@example.com",
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

    await user.type(screen.getByLabelText(/email/i), "vendor@example.com");
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

  // Unlike AdminLoginForm, this form DOES render the vendor-inquiry CTA
  // -- GLPDX-50 explicitly requires it (there's no self-registration;
  // this is how a vendor without an account reaches the inquiry
  // pipeline). Interim target "/" (not /get-listed), same pattern and
  // same reasoning as -FaqPage.tsx/-ContactPage.tsx: GLPDX-157 hasn't
  // moved the form yet, and this component's tests run without a real
  // RouterProvider.
  it("renders the vendor-inquiry CTA link pointing at the inquiry form's current location", () => {
    renderWithQueryClient();

    expect(
      screen.getByText(/don't have an account\? interested in becoming a listed vendor\?/i),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /reach out here/i });
    expect(link).toHaveAttribute("href", "/");
  });

  // GLPDX-153 (password reset flow) doesn't exist yet -- interim
  // decision this session: render as non-interactive text rather than
  // a link pointing nowhere real, so there's nothing broken to click.
  it("renders \"Forgot password?\" as non-interactive text, not a link", () => {
    renderWithQueryClient();

    expect(screen.getByText(/forgot password\?/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /forgot password/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates to /portal once the login mutation succeeds", () => {
    mockMutationState = {
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    };
    renderWithQueryClient();

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal" });
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