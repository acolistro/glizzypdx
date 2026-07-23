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
import { getServiceRoleClient, seedVendor } from "./clients";

const serviceRole = getServiceRoleClient();

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