import { describe, it, expect, vi } from "vitest";
import { requireAdmin } from "./require-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeFakeSupabase(getUserResult: { data: { user: unknown }; error: unknown }) {
  const getUser = vi.fn().mockResolvedValue(getUserResult);
  return { auth: { getUser } } as unknown as SupabaseClient;
}

const adminUser = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", app_metadata: { role: "admin" } };
const vendorUser = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", app_metadata: { role: "vendor" } };
const noRoleUser = { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", app_metadata: {} };

describe("requireAdmin", () => {
  it("returns isAdmin: true with the user's id when app_metadata.role is 'admin'", async () => {
    const supabase = makeFakeSupabase({ data: { user: adminUser }, error: null });
    const result = await requireAdmin("valid-admin-token", { supabase });
    expect(result).toEqual({ isAdmin: true, userId: adminUser.id });
    expect(supabase.auth.getUser).toHaveBeenCalledWith("valid-admin-token");
  });

  it("fails closed with isAdmin: false when the session belongs to a non-admin (e.g. a vendor)", async () => {
    const supabase = makeFakeSupabase({ data: { user: vendorUser }, error: null });
    const result = await requireAdmin("valid-vendor-token", { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
  });

  it("fails closed with isAdmin: false when app_metadata has no role at all", async () => {
    const supabase = makeFakeSupabase({ data: { user: noRoleUser }, error: null });
    const result = await requireAdmin("valid-token-no-role", { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
  });

  it("fails closed with isAdmin: false when Supabase returns an error (expired/invalid token)", async () => {
    const supabase = makeFakeSupabase({ data: { user: null }, error: { message: "invalid JWT", status: 401 } });
    const result = await requireAdmin("expired-token", { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
  });

  it("fails closed with isAdmin: false when there is no user at all despite no error", async () => {
    const supabase = makeFakeSupabase({ data: { user: null }, error: null });
    const result = await requireAdmin("some-token", { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
  });

  it("fails closed with isAdmin: false when no token is provided, without calling Supabase at all", async () => {
    const supabase = makeFakeSupabase({ data: { user: null }, error: null });
    const result = await requireAdmin(null, { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("fails closed with isAdmin: false when the token is an empty string", async () => {
    const supabase = makeFakeSupabase({ data: { user: null }, error: null });
    const result = await requireAdmin("", { supabase });
    expect(result).toEqual({ isAdmin: false, userId: null });
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });
});