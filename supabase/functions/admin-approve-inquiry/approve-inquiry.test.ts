/**
 * approve-inquiry.test.ts
 *
 * Unit tests for the approveInquiry business logic (GLPDX-130 /
 * GLPDX-176). The Supabase client is entirely mocked here — no real
 * network call, no Docker/local-stack dependency — so this file runs
 * as part of `pnpm coverage` alongside everything else. Integration
 * coverage against the real local stack happens separately via the
 * smoke-test curl steps in the session handoff.
 *
 * TDD note: written against a stub that threw `Error("not
 * implemented")`, confirmed red for the right reason (a real thrown
 * error, not an import-resolution crash), before approve-inquiry.ts's
 * actual implementation was written — same discipline as
 * list-inquiries.test.ts.
 */

import { describe, it, expect, vi } from "vitest";
import { approveInquiry } from "./approve-inquiry";

/**
 * Builds a minimal fake Supabase client for one test case.
 *
 * WHERE ITS DATA COMES FROM: the `overrides` argument — each test
 * passes only the parts of the mock it cares about, so the mocked
 * behavior for that specific scenario is visible in the test itself
 * rather than buried in shared setup.
 *
 * WHERE ITS OUTPUT GOES: returned to the test, then passed into
 * approveInquiry() in place of a real SupabaseClient.
 */
function buildMockClient(overrides: {
  fetchResult?: { data: unknown; error: unknown };
  inviteResult?: { error: unknown };
  updateResult?: { error: unknown };
}) {
  const fetchResult = overrides.fetchResult ?? {
    data: { contact_email: "vendor@example.com" },
    error: null,
  };
  const inviteResult = overrides.inviteResult ?? { error: null };
  const updateResult = overrides.updateResult ?? { error: null };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(fetchResult)),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(updateResult)),
      })),
    })),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(() => Promise.resolve(inviteResult)),
      },
    },
    // The real SupabaseClient type is large; this mock only implements
    // the surface approveInquiry() actually touches. `as any` here is
    // a deliberate, contained escape hatch for test setup only — it
    // never appears in production code.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("approveInquiry", () => {
  it("invites the vendor and marks the inquiry actioned on success", async () => {
    const client = buildMockClient({});

    const result = await approveInquiry(client, "inquiry-123");

    expect(result).toEqual({ success: true });
    expect(client.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "vendor@example.com",
    );
  });

  it("does not update status and returns an error when the invite fails", async () => {
    const client = buildMockClient({
      inviteResult: { error: { message: "invite failed: rate limited" } },
    });

    const result = await approveInquiry(client, "inquiry-123");

    expect(result).toEqual({
      success: false,
      error: "invite failed: rate limited",
    });
    // The critical behavior from GLPDX-176's scope: a failed invite
    // must never touch the row's status. If the update step had run,
    // `from` would have been called a second time (once for the
    // select, once for the update) — it wasn't.
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("returns an error and never invites when the inquiry lookup fails", async () => {
    const client = buildMockClient({
      fetchResult: { data: null, error: { message: "not found" } },
    });

    const result = await approveInquiry(client, "missing-id");

    expect(result).toEqual({ success: false, error: "Inquiry not found" });
    expect(client.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("returns an error when the invite succeeds but the status update fails", async () => {
    const client = buildMockClient({
      updateResult: { error: { message: "db write failed" } },
    });

    const result = await approveInquiry(client, "inquiry-123");

    expect(result).toEqual({ success: false, error: "db write failed" });
    // The invite genuinely went out even though this call reports
    // failure overall — worth remembering when reading the "edge case"
    // note in approve-inquiry.ts's doc comment.
    expect(client.auth.admin.inviteUserByEmail).toHaveBeenCalled();
  });
});