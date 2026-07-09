import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVendorInquiry } from "./useVendorInquiry";

// Mock the Supabase client module so we never make a real network call in
// tests. We only care that useVendorInquiry calls `functions.invoke` with
// the right function name and payload, and reacts correctly to what it
// resolves with — not that Supabase itself works.
vi.mock("../../../lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Importing the mocked module AFTER vi.mock so we get the mocked version,
// and casting `invoke` so TypeScript knows it's a Vitest mock function
// with .mockResolvedValueOnce etc. available.
import { supabase } from "../../../lib/supabase";
const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

/**
 * TanStack Query's useMutation needs a QueryClientProvider ancestor to
 * work at all, even outside a real component tree. This wrapper supplies
 * a fresh, isolated QueryClient per test so mutation state (loading,
 * error, etc.) never leaks between tests.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const validInput = {
  businessName: "Pink Dog Carts",
  contactEmail: "owner@pinkdogcarts.com",
  message: "We'd love to be listed on GlizzyPDX!",
  turnstileToken: "fake-turnstile-token",
};

describe("useVendorInquiry", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("calls the submit-vendor-inquiry Edge Function with the form data", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { outcome: "created", inquiryId: "abc-123" },
      error: null,
    });

    const { result } = renderHook(() => useVendorInquiry(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockInvoke).toHaveBeenCalledWith("submit-vendor-inquiry", {
      body: validInput,
    });
  });

  it("exposes 'created' data on success", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { outcome: "created", inquiryId: "abc-123" },
      error: null,
    });

    const { result } = renderHook(() => useVendorInquiry(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ outcome: "created", inquiryId: "abc-123" });
  });

  it("surfaces a transport-level error (network failure) as mutation error", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to fetch" },
    });

    const { result } = renderHook(() => useVendorInquiry(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("surfaces an application-level rejection (e.g. invalid_captcha) as mutation error, not silent success", async () => {
    // The Edge Function returns HTTP 400 with a JSON body for captcha/validation
    // failures — supabase-js's functions.invoke() treats non-2xx as `error`,
    // not `data`, so we simulate that here.
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code" },
    });

    const { result } = renderHook(() => useVendorInquiry(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("starts in an idle state and reflects isPending while the mutation is in flight", async () => {
    let resolveInvoke: (value: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      }),
    );

    const { result } = renderHook(() => useVendorInquiry(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);

    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolveInvoke!({ data: { outcome: "created", inquiryId: "abc-123" }, error: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});