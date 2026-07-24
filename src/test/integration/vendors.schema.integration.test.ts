/**
 * Integration test for the `vendors.show_last_known` column (prerequisite for GLPDX-12).
 *
 * This is a SCHEMA-CONTRACT test, same category as checkins.schema.integration.test.ts: it
 * asserts column shape/default/constraint, not app behavior. There is no portal UI or hook for
 * this column yet -- that's GLPDX-72's job, which also owns the eventual write-side RLS policy
 * (see the GLPDX-72 comment thread for why the existing "draft or submitted" UPDATE policy can't
 * just be reused for this column without locking approved vendors out of ever toggling it).
 *
 * This file only covers the column's existence, default, and NOT NULL constraint -- the minimum
 * GLPDX-12 needs to write a checkins RLS policy that reads this column. It does NOT test RLS on
 * `vendors` itself; that's already covered by GLPDX-13's existing policies (public/own-profile
 * SELECT, own-profile UPDATE while draft/submitted), which are unaffected by adding a column.
 *
 * TDD status as of writing: expected to FAIL (red) until the show_last_known migration lands.
 *
 * Data flow: uses the shared `seedVendor()` helper from ./clients (also used by
 * checkins.schema.integration.test.ts) via a service_role client, which bypasses RLS -- this
 * file is about column shape, not access control, so service_role is the right tool throughout.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAuthedTestUser, getServiceRoleClient, seedVendor } from "./clients";

const serviceRole = getServiceRoleClient();

describe("vendors UPDATE policy + self-edit trigger (GLPDX-167)", () => {
  let seededVendorIds: string[] = [];
  let authedUsers: Awaited<ReturnType<typeof createAuthedTestUser>>[] = [];
 
  afterEach(async () => {
    for (const id of seededVendorIds) {
      await getServiceRoleClient().from("vendors").delete().eq("id", id);
    }
    seededVendorIds = [];
 
    for (const u of authedUsers) {
      await u.cleanup();
    }
    authedUsers = [];
  });
 
  it("allows an approved vendor to update show_last_known", async () => {
    const authed = await createAuthedTestUser();
    authedUsers.push(authed);
 
    const vendorId = await seedVendor({ status: "approved", owner_user_id: authed.user.id });
    seededVendorIds.push(vendorId);
 
    const { error } = await authed.client
      .from("vendors")
      .update({ show_last_known: true })
      .eq("id", vendorId);
 
    expect(error).toBeNull();
 
    const { data } = await getServiceRoleClient()
      .from("vendors")
      .select("show_last_known")
      .eq("id", vendorId)
      .single();
    expect(data?.show_last_known).toBe(true);
  });
 
  it("blocks an approved vendor from updating other profile fields", async () => {
    const authed = await createAuthedTestUser();
    authedUsers.push(authed);
 
    const vendorId = await seedVendor({ status: "approved", owner_user_id: authed.user.id });
    seededVendorIds.push(vendorId);
 
    const { error } = await authed.client
      .from("vendors")
      .update({ name: "Sneaky Rename" })
      .eq("id", vendorId);
 
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Approved vendors can only update show_last_known");
 
    // Confirm the row genuinely didn't change -- not just that an error came back.
    const { data } = await getServiceRoleClient()
      .from("vendors")
      .select("name")
      .eq("id", vendorId)
      .single();
    expect(data?.name).not.toBe("Sneaky Rename");
  });
 
  it("blocks an approved vendor from changing show_last_known AND a profile field in the same update", async () => {
    // This is the exact case that made the naive "second permissive policy" approach unsafe --
    // asserting it directly so a future regression (e.g. someone re-adding a second UPDATE
    // policy) gets caught here, not discovered in production.
    const authed = await createAuthedTestUser();
    authedUsers.push(authed);
 
    const vendorId = await seedVendor({ status: "approved", owner_user_id: authed.user.id });
    seededVendorIds.push(vendorId);
 
    const { error } = await authed.client
      .from("vendors")
      .update({ show_last_known: true, name: "Sneaky Rename" })
      .eq("id", vendorId);
 
    expect(error).not.toBeNull();
 
    const { data } = await getServiceRoleClient()
      .from("vendors")
      .select("name, show_last_known")
      .eq("id", vendorId)
      .single();
    expect(data?.name).not.toBe("Sneaky Rename");
    expect(data?.show_last_known).toBe(false);
  });
 
  it.each(["draft", "submitted"] as const)(
    "blocks a %s vendor from setting their own status to approved",
    async (startStatus) => {
      const authed = await createAuthedTestUser();
      authedUsers.push(authed);
 
      const vendorId = await seedVendor({ status: startStatus, owner_user_id: authed.user.id });
      seededVendorIds.push(vendorId);
 
      const { error } = await authed.client
        .from("vendors")
        .update({ status: "approved" })
        .eq("id", vendorId);
 
      expect(error).not.toBeNull();
      expect(error?.message).toContain(
        "Vendors cannot set their own status to approved or rejected",
      );
    },
  );
 
  it.each(["draft", "submitted"] as const)(
    "blocks a %s vendor from setting their own status to rejected",
    async (startStatus) => {
      const authed = await createAuthedTestUser();
      authedUsers.push(authed);
 
      const vendorId = await seedVendor({ status: startStatus, owner_user_id: authed.user.id });
      seededVendorIds.push(vendorId);
 
      const { error } = await authed.client
        .from("vendors")
        .update({ status: "rejected" })
        .eq("id", vendorId);
 
      expect(error).not.toBeNull();
      expect(error?.message).toContain(
        "Vendors cannot set their own status to approved or rejected",
      );
    },
  );
 
  it("blocks a rejected vendor from editing a field without resubmitting", async () => {
    const authed = await createAuthedTestUser();
    authedUsers.push(authed);
 
    const vendorId = await seedVendor({ status: "rejected", owner_user_id: authed.user.id });
    seededVendorIds.push(vendorId);
 
    // Editing a field but leaving status at 'rejected' -- should be rejected, matching the old
    // policy's incidental behavior (see GLPDX-167 discussion).
    const { error } = await authed.client
      .from("vendors")
      .update({ name: "Updated Name" })
      .eq("id", vendorId);
 
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Rejected vendor edits must resubmit");
  });
 
  it("allows a rejected vendor to edit a field when also resubmitting (status -> submitted)", async () => {
    const authed = await createAuthedTestUser();
    authedUsers.push(authed);
 
    const vendorId = await seedVendor({ status: "rejected", owner_user_id: authed.user.id });
    seededVendorIds.push(vendorId);
 
    const { error } = await authed.client
      .from("vendors")
      .update({ name: "Updated Name", status: "submitted" })
      .eq("id", vendorId);
 
    expect(error).toBeNull();
 
    const { data } = await getServiceRoleClient()
      .from("vendors")
      .select("name, status")
      .eq("id", vendorId)
      .single();
    expect(data?.name).toBe("Updated Name");
    expect(data?.status).toBe("submitted");
  });
 
  it.each(["draft", "submitted"] as const)(
    "allows a %s vendor to edit profile fields as before (regression)",
    async (startStatus) => {
      const authed = await createAuthedTestUser();
      authedUsers.push(authed);
 
      const vendorId = await seedVendor({ status: startStatus, owner_user_id: authed.user.id });
      seededVendorIds.push(vendorId);
 
      const { error } = await authed.client
        .from("vendors")
        .update({ name: "Updated Name", status: "submitted" })
        .eq("id", vendorId);
 
      expect(error).toBeNull();
 
      const { data } = await getServiceRoleClient()
        .from("vendors")
        .select("name, status")
        .eq("id", vendorId)
        .single();
      expect(data?.name).toBe("Updated Name");
      expect(data?.status).toBe("submitted");
    },
  );
 
  it("lets service_role bypass all trigger restrictions (admin approval flow)", async () => {
    // No authed user needed here -- this asserts the ADMIN path still works, using the same
    // service_role client the real admin approval flow uses. This is what proves the trigger's
    // `auth.role() = 'authenticated'` gate is correctly scoped, not accidentally blocking Alyssa.
    const vendorId = await seedVendor({ status: "submitted" });
    seededVendorIds.push(vendorId);
 
    const { error } = await getServiceRoleClient()
      .from("vendors")
      .update({ status: "approved", name: "Admin Renamed" })
      .eq("id", vendorId);
 
    expect(error).toBeNull();
 
    const { data } = await getServiceRoleClient()
      .from("vendors")
      .select("name, status")
      .eq("id", vendorId)
      .single();
    expect(data?.status).toBe("approved");
    expect(data?.name).toBe("Admin Renamed");
  });
});

describe("vendors.show_last_known column (GLPDX-12 prerequisite)", () => {
  let seededVendorIds: string[] = [];

  afterEach(async () => {
    for (const id of seededVendorIds) {
      await serviceRole.from("vendors").delete().eq("id", id);
    }
    seededVendorIds = [];
  });

  it("defaults to false when not supplied on insert", async () => {
    const vendorId = await seedVendor();
    seededVendorIds.push(vendorId);

    const { data, error } = await serviceRole
      .from("vendors")
      .select("show_last_known")
      .eq("id", vendorId)
      .single();

    expect(error).toBeNull();
    expect(data?.show_last_known).toBe(false);
  });

  it("accepts an explicit true value", async () => {
    const vendorId = await seedVendor();
    seededVendorIds.push(vendorId);

    const { error: updateError } = await serviceRole
      .from("vendors")
      .update({ show_last_known: true })
      .eq("id", vendorId);
    expect(updateError).toBeNull();

    const { data, error } = await serviceRole
      .from("vendors")
      .select("show_last_known")
      .eq("id", vendorId)
      .single();

    expect(error).toBeNull();
    expect(data?.show_last_known).toBe(true);
  });

  it("rejects an explicit null (NOT NULL constraint)", async () => {
    const { error } = await serviceRole
      .from("vendors")
      .insert({ name: `Test Vendor ${crypto.randomUUID()}`, show_last_known: null });

    // Postgres NOT NULL violation -- no row is created, so nothing to clean up.
    expect(error).not.toBeNull();
  });
});

describe("vendors.last_known_opt_in column (GLPDX-166 — dead duplicate)", () => {
  let seededVendorIds: string[] = [];

  afterEach(async () => {
    for (const id of seededVendorIds) {
      await serviceRole.from("vendors").delete().eq("id", id);
    }
    seededVendorIds = [];
  });

  it("does not exist as a column (dropped as a dead duplicate of show_last_known)", async () => {
    // Selecting a nonexistent column should fail with a Postgres "column does not exist" error.
    // This is a negative-schema assertion, proving something is ABSENT -- it exists so that if
    // last_known_opt_in is ever accidentally reintroduced (e.g. a bad migration revert, or
    // someone copy-pasting from the original GLPDX-3 migration), a test catches the two-column
    // drift bug coming back immediately, rather than it surfacing later as confused RLS behavior.
    const vendorId = await seedVendor();
    seededVendorIds.push(vendorId);

    const { error } = await serviceRole
      .from("vendors")
      .select("last_known_opt_in")
      .eq("id", vendorId)
      .single();

    expect(error).not.toBeNull();
    expect(error?.message).toContain("last_known_opt_in");
  });
});