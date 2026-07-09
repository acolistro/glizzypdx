// supabase/functions/handle-vendor-invite/create-vendor-draft.test.ts

import { describe, it, expect, vi } from "vitest";
import { createVendorDraft } from "./create-vendor-draft";

function mockSupabase({
  inquiryResult,
  insertResult,
}: {
  inquiryResult: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
}) {
  const single = vi.fn()
    .mockResolvedValueOnce(inquiryResult)
    .mockResolvedValueOnce(insertResult);

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single,
  };

  return { from: vi.fn().mockReturnValue(chain) } as any;
}

describe("createVendorDraft", () => {
  it("creates a draft vendor row for a valid vendor invite", async () => {
    const supabase = mockSupabase({
      inquiryResult: { data: { business_name: "Dog Haus PDX" }, error: null },
      insertResult: { data: { id: "vendor-123" }, error: null },
    });

    const result = await createVendorDraft(
      { id: "user-1", raw_user_meta_data: { role: "vendor", inquiry_id: "inq-1" } },
      supabase,
    );

    expect(result).toEqual({ outcome: "created", vendorId: "vendor-123" });
  });

  it("skips invites without role: 'vendor' (e.g. admin invites)", async () => {
    const supabase = mockSupabase({ inquiryResult: { data: null, error: null } });

    const result = await createVendorDraft(
      { id: "admin-1", raw_user_meta_data: { role: "admin" } },
      supabase,
    );

    expect(result).toEqual({ outcome: "skipped_not_vendor" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("errors explicitly when inquiry_id is missing", async () => {
    const supabase = mockSupabase({ inquiryResult: { data: null, error: null } });

    const result = await createVendorDraft(
      { id: "user-2", raw_user_meta_data: { role: "vendor" } },
      supabase,
    );

    expect(result.outcome).toBe("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("errors explicitly when inquiry_id doesn't match any row", async () => {
    const supabase = mockSupabase({
      inquiryResult: { data: null, error: { message: "no rows" } },
    });

    const result = await createVendorDraft(
      { id: "user-3", raw_user_meta_data: { role: "vendor", inquiry_id: "bad-id" } },
      supabase,
    );

    expect(result.outcome).toBe("error");
  });

  it("treats a duplicate webhook delivery as a no-op, not an error", async () => {
    const supabase = mockSupabase({
      inquiryResult: { data: { business_name: "Dog Haus PDX" }, error: null },
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    });

    const result = await createVendorDraft(
      { id: "user-1", raw_user_meta_data: { role: "vendor", inquiry_id: "inq-1" } },
      supabase,
    );

    expect(result).toEqual({ outcome: "skipped_duplicate" });
  });
});