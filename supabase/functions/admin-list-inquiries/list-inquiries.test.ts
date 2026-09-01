import { describe, it, expect, vi } from "vitest";
import { listInquiries } from "./list-inquiries";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeFakeSupabase(selectResult: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(selectResult);
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

const pendingInquiries = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    business_name: "Pink Dog Carts",
    contact_email: "owner@pinkdogcarts.com",
    message: "We'd love to be listed!",
    status: "new",
    created_at: "2026-08-01T12:00:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    business_name: "Rose City Dogs",
    contact_email: "hello@rosecitydogs.com",
    message: null,
    status: "new",
    created_at: "2026-08-05T09:30:00Z",
  },
];

describe("listInquiries", () => {
  it("returns 'success' with the pending (status='new') inquiries, oldest first", async () => {
    const supabase = makeFakeSupabase({ data: pendingInquiries, error: null });

    const result = await listInquiries({ supabase });

    expect(result).toEqual({ outcome: "success", inquiries: pendingInquiries });
    expect(supabase.from).toHaveBeenCalledWith("vendor_inquiries");
  });

  it("only queries rows with status='new' — never surfaces already-actioned inquiries", async () => {
    const supabase = makeFakeSupabase({ data: [], error: null });

    await listInquiries({ supabase });

    const fromResult = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(fromResult.select).toHaveBeenCalled();
    const selectResult = (fromResult.select as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(selectResult.eq).toHaveBeenCalledWith("status", "new");
  });

  it("orders oldest-first so the admin works through the backlog in submission order", async () => {
    const supabase = makeFakeSupabase({ data: [], error: null });

    await listInquiries({ supabase });

    const fromResult = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    const selectResult = (fromResult.select as ReturnType<typeof vi.fn>).mock.results[0].value;
    const eqResult = (selectResult.eq as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(eqResult.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("returns 'success' with an empty array when there are no pending inquiries", async () => {
    const supabase = makeFakeSupabase({ data: [], error: null });

    const result = await listInquiries({ supabase });

    expect(result).toEqual({ outcome: "success", inquiries: [] });
  });

  it("returns 'database_error' when the query fails", async () => {
    const supabase = makeFakeSupabase({
      data: null,
      error: { message: "connection refused", code: "08006" },
    });

    const result = await listInquiries({ supabase });

    expect(result.outcome).toBe("database_error");
  });
});