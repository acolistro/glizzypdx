import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

// -----------------------------------------------------------------------
// WHAT THIS FILE TESTS
// -----------------------------------------------------------------------
// useAdminLogin wraps Supabase Auth's signInWithPassword as a TanStack
// Query mutation, mirroring the useVendorInquiry pattern already
// established in this codebase. Two things make this different from a
// generic login hook, both security-critical and both tested below:
//
// 1. Turnstile verification happens server-side, inside Supabase's own
//    Auth service, via the `captchaToken` option -- NOT a custom Edge
//    Function like the inquiry form uses (see chat discussion: a custom
//    verification step could be bypassed by calling Supabase's public
//    Auth endpoint directly, since that endpoint is exposed by Supabase
//    itself, not fully mediated by our own backend).
//
// 2. A successful password authentication is NOT enough to succeed here.
//    If the authenticated user's role isn't "admin" (e.g. a future
//    vendor account entering valid credentials on the WRONG form), this
//    hook signs them back out immediately and throws the exact same
//    generic error as a wrong password would. This is deliberate:
//    distinguishing "wrong password" from "correct password, wrong
//    role" would leak information about which accounts exist and what
//    they are, which is exactly the account-enumeration risk GLPDX-82
//    calls out.
// -----------------------------------------------------------------------

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { supabase } from "../../../lib/supabase";
import { useAdminLogin } from "./useAdminLogin";

const mockSignInWithPassword = vi.mocked(supabase.auth.signInWithPassword);
const mockSignOut = vi.mocked(supabase.auth.signOut);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const validInput = {
  email: "arcolistro@gmail.com",
  password: "correct-horse-battery-staple",
  captchaToken: "fake-turnstile-token",
};

function makeFakeSession(role: string | undefined): Session {
  return {
    access_token: "fake-access-token",
    user: {
      id: "fake-admin-id",
      app_metadata: role === undefined ? {} : { role },
    },
  } as unknown as Session;
}

describe("useAdminLogin", () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset();
  });

  it("calls signInWithPassword with email, password, and the Turnstile token as captchaToken", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession("admin"), user: null } as never,
      error: null,
    });

    const { result } = renderHook(() => useAdminLogin(), {
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

  it("succeeds when the authenticated user has role 'admin'", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession("admin"), user: null } as never,
      error: null,
    });

    const { result } = renderHook(() => useAdminLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("surfaces invalid credentials as a mutation error", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" } as never,
    });

    const { result } = renderHook(() => useAdminLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs the user back out and fails with a GENERIC error when credentials are valid but the role is not 'admin'", async () => {
    // This is the account-enumeration-safe branch: authentication itself
    // succeeded (correct email + password for some real account), but
    // that account isn't the admin. The failure must look identical to
    // a wrong password from the outside.
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession("vendor"), user: null } as never,
      error: null,
    });
    mockSignOut.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useAdminLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("signs the user back out when a session exists but has no role at all", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: makeFakeSession(undefined), user: null } as never,
      error: null,
    });
    mockSignOut.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useAdminLogin(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("starts idle and reflects isPending while the mutation is in flight", async () => {
    let resolveSignIn: (value: unknown) => void;
    mockSignInWithPassword.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useAdminLogin(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolveSignIn!({
      data: { session: makeFakeSession("admin"), user: null } as never,
      error: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});