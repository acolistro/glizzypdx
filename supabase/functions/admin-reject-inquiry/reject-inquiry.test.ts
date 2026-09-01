/**
 * reject-inquiry.test.ts
 *
 * Unit tests for the rejectInquiry business logic (GLPDX-130 /
 * GLPDX-176). Supabase client is entirely mocked — no real network or
 * Docker dependency.
 *
 * TDD note: run against the throwing stub first, confirmed red for the
 * right reason, before the real implementation replaces it.
 */

import { describe, it, expect, vi } from "vitest";
import { rejectInquiry } from "./reject-inquiry";

/**
 * Builds a minimal fake Supabase client for one test case.
 *
 * `deletedRows` models the array .select("id") returns after a delete
 * — an empty array means nothing matched the id, which is how we
 * distinguish "actually deleted a row" from "no-op on a missing row"
 * (delete-by-id alone reports no error either way).
 */
function buildMockClient(overrides: {
  deletedRows?: Array<{ id: string }>;
  error?: unknown;
}) {
  const deletedRows = overrides.deletedRows ?? [{ id: "inquiry-123" }];
  const error = overrides.error ?? null;

  return {
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() =>
            Promise.resolve({ data: error ? null : deletedRows, error }),
          ),
        })),
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("rejectInquiry", () => {
  it("deletes the inquiry and returns success when a row was removed", async () => {
    const client = buildMockClient({ deletedRows: [{ id: "inquiry-123" }] });

    const result = await rejectInquiry(client, "inquiry-123");

    expect(result).toEqual({ success: true });
  });

  it("returns an error when no row matched the given id", async () => {
    const client = buildMockClient({ deletedRows: [] });

    const result = await rejectInquiry(client, "missing-id");

    expect(result).toEqual({ success: false, error: "Inquiry not found" });
  });

  it("returns an error when the delete itself fails", async () => {
    const client = buildMockClient({
      error: { message: "db write failed" },
    });

    const result = await rejectInquiry(client, "inquiry-123");

    expect(result).toEqual({ success: false, error: "db write failed" });
  });
});