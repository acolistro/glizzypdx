import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

// Mirrors useAdminLogin.test.tsx's pattern, minus the role-check tests --
// per explicit decision, vendor login has no role guard: any successful
// authentication (any account type) is treated as a valid vendor login.

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

import { supabase } from "../../../lib/supabase";
import { useVendorLogin } from "./useVendorLogin";

const mockSignInWithPassword = vi.mocked(supabase.auth.signInWithPassword);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const validInput = {
  email: "vendor@example.com",
  password: "correct-horse-battery-staple",
  captchaToken: "fake-turnstile-token",
};

function makeFakeSession(): Session {
  return {
    access_token: "fake-access-token",
    user: { id: "fake-vendor-id", app_metadata: {} },
  } as unknown as Session;
}

describe("useVendorLogin", () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
  });

  it("calls signInWithPassword with email, password, and the Turnstile token as captchaToken", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession(), user: null } as never,
      error: null,
    });

    const { result } = renderHook(() => useVendorLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: validInput.email,
      password: validInput.password,
      options: { captchaToken: validInput.captchaToken },
    });
  });

  it("succeeds for any authenticated account, with no role check", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession(), user: null } as never,
      error: null,
    });

    const { result } = renderHook(() => useVendorLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("surfaces invalid credentials as a generic mutation error", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" } as never,
    });

    const { result } = renderHook(() => useVendorLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Invalid email or password.");
  });

  it("starts idle and reflects isPending while the mutation is in flight", async () => {
    let resolveSignIn: (value: unknown) => void;
    mockSignInWithPassword.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useVendorLogin(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolveSignIn!({
      data: { session: makeFakeSession(), user: null } as never,
      error: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});