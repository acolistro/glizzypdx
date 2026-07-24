/**
 * GLPDX-161: Integration tests for the `checkins` table schema.
 * GLPDX-12: Integration tests for the checkins RLS policies (public active-checkin read,
 * last-known-opt-in read, vendor-scoped insert), added alongside this ticket's migration.
 *
 * This is a SCHEMA-CONTRACT test, not a feature/behavior test: it asserts that the database
 * itself — column shape, types, constraints, cascade behavior, and RLS behavior — matches what
 * GLPDX-11's and GLPDX-12's migrations are supposed to create. It does NOT test any app code;
 * there is no checkins UI or hook yet. That's why it lives in src/test/integration/ (grouped
 * with other schema-contract tests) rather than co-located in a feature folder — see the
 * GLPDX-161 discussion for why shared-table schema tests don't fit the feature-co-location rule.
 *
 * Data flow: each test gets its own Supabase clients from ../integration/clients.ts:
 *   - service_role client: seeds `vendors` rows (checkins needs a valid vendor_id to point at)
 *     and, for the cascade test, deletes it again — this is the only role allowed to write here
 *     freely, since it bypasses RLS entirely.
 *   - anon / authenticated clients: used to prove both the deny-all baseline (before GLPDX-12's
 *     policies existed) and, further down, the actual GLPDX-12 policy behavior — never to seed
 *     data, since that's exactly the access they shouldn't have outside what's under test.
 *
 * seedVendor() is imported from the shared ./clients module (GLPDX-162), not redeclared here —
 * a local redeclaration of the same name previously existed in this file and shadowed the
 * import, which is a duplicate-identifier compile error. Removed as part of GLPDX-12 cleanup;
 * every seed call below goes through the shared helper.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAuthedTestUser,
  getAnonClient,
  getServiceRoleClient,
  seedVendor,
  type AuthedTestUser,
} from "./clients";

// The service_role client is reused across every test in this file purely for vendor seeding —
// it never touches the checkins table directly except where a test is explicitly checking
// service_role's own bypass-RLS behavior.
const serviceRole = getServiceRoleClient();

/** A minimal, otherwise-valid checkins row shape, reused across the column/constraint tests. */
function validCheckinPayload(vendorId: string) {
  return {
    vendor_id: vendorId,
    lat: 45.5231,
    lng: -122.6765,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
  };
}

/** Same shape as validCheckinPayload, but already expired — used by the last-known tests. */
function expiredCheckinPayload(vendorId: string, expiresAt: Date) {
  return {
    vendor_id: vendorId,
    lat: 45.5231,
    lng: -122.6765,
    expires_at: expiresAt.toISOString(),
  };
}

describe("checkins table schema (GLPDX-161 / GLPDX-11)", () => {
  // Track vendor ids created per-test so we can clean them up afterward. Cleaning up the
  // vendors row also exercises/cleans up any checkins row via cascade, but we don't rely on
  // that for cleanup correctness — it's asserted explicitly in its own test below.
  let seededVendorIds: string[] = [];

  afterEach(async () => {
    for (const id of seededVendorIds) {
      await serviceRole.from("vendors").delete().eq("id", id);
    }
    seededVendorIds = [];
  });

  describe("column shape and constraints", () => {
    it("accepts a valid checkin row and returns the expected columns", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const payload = validCheckinPayload(vendorId);
      const { data, error } = await serviceRole
        .from("checkins")
        .insert(payload)
        .select("id, vendor_id, lat, lng, area_label, expires_at, event_note, created_at")
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        vendor_id: vendorId,
        lat: payload.lat,
        lng: payload.lng,
        area_label: null, // nullable, not supplied
        event_note: null, // nullable, not supplied
      });
      expect(data?.id).toEqual(expect.any(String));
      expect(data?.expires_at).not.toBeNull();
      // created_at should have been populated by DEFAULT now() without us supplying it.
      expect(data?.created_at).not.toBeNull();
    });

    it("accepts optional area_label and event_note as free text when provided", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const { data, error } = await serviceRole
        .from("checkins")
        .insert({
          ...validCheckinPayload(vendorId),
          area_label: "Alberta Arts",
          event_note: "At the farmers market today",
        })
        .select("area_label, event_note")
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        area_label: "Alberta Arts",
        event_note: "At the farmers market today",
      });
    });

    it("rejects a checkin with no vendor_id", async () => {
      const { error } = await serviceRole.from("checkins").insert({
        lat: 45.5231,
        lng: -122.6765,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      // Postgres NOT NULL violation.
      expect(error).not.toBeNull();
    });

    it("rejects a checkin with no lat", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const { error } = await serviceRole.from("checkins").insert({
        vendor_id: vendorId,
        lng: -122.6765,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("rejects a checkin with no lng", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const { error } = await serviceRole.from("checkins").insert({
        vendor_id: vendorId,
        lat: 45.5231,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("rejects a checkin with no expires_at", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const { error } = await serviceRole.from("checkins").insert({
        vendor_id: vendorId,
        lat: 45.5231,
        lng: -122.6765,
      });
      expect(error).not.toBeNull();
    });

    it("rejects a checkin pointing at a vendor_id that does not exist (FK enforcement)", async () => {
      const { error } = await serviceRole.from("checkins").insert({
        vendor_id: crypto.randomUUID(), // valid uuid shape, but no such vendor row
        lat: 45.5231,
        lng: -122.6765,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      // Postgres foreign key violation.
      expect(error).not.toBeNull();
    });
  });

  describe("created_at default", () => {
    it("defaults created_at to now() when not supplied", async () => {
      const vendorId = await seedVendor();
      seededVendorIds.push(vendorId);

      const before = Date.now();
      const { data, error } = await serviceRole
        .from("checkins")
        .insert(validCheckinPayload(vendorId))
        .select("created_at")
        .single();
      const after = Date.now();

      expect(error).toBeNull();
      const createdAtMs = new Date(data!.created_at as string).getTime();
      // Loose bound rather than an exact match — proves the DB set it to "now", not that our
      // clock and Postgres's clock agree to the millisecond.
      expect(createdAtMs).toBeGreaterThanOrEqual(before - 5000);
      expect(createdAtMs).toBeLessThanOrEqual(after + 5000);
    });
  });

  describe("ON DELETE CASCADE from vendors", () => {
    it("deletes associated checkins when the parent vendor row is deleted", async () => {
      const vendorId = await seedVendor();
      // Deliberately NOT pushed to seededVendorIds — this test deletes the vendor itself as
      // its own assertion, so the afterEach cleanup would just be a harmless no-op double-delete.

      const { data: checkin, error: insertError } = await serviceRole
        .from("checkins")
        .insert(validCheckinPayload(vendorId))
        .select("id")
        .single();
      expect(insertError).toBeNull();

      const { error: deleteError } = await serviceRole.from("vendors").delete().eq("id", vendorId);
      expect(deleteError).toBeNull();

      const { data: survivingCheckin, error: selectError } = await serviceRole
        .from("checkins")
        .select("id")
        .eq("id", checkin!.id)
        .maybeSingle();

      expect(selectError).toBeNull();
      expect(survivingCheckin).toBeNull(); // cascaded away with the vendor
    });
  });

  describe("RLS baseline (pre-GLPDX-12: non-approved vendors always stay hidden)", () => {
    // Originally this block asserted a blanket "RLS denies everyone" baseline, written before
    // GLPDX-12's policies existed. Now that GLPDX-12 has landed, a bare "anon sees zero rows"
    // assertion is no longer true in general — an approved, unexpired checkin IS visible to
    // anon. What's still true, and still worth asserting explicitly, is that a checkin belonging
    // to a NON-approved vendor stays invisible no matter what. Rescoped rather than deleted: the
    // underlying security property ("draft/submitted/rejected vendors never leak checkins") is
    // exactly the kind of thing that should keep being tested, not lost when the policies landed.
    let authed: AuthedTestUser;
    let vendorId: string;

    beforeEach(async () => {
      // Deliberately a non-approved (default 'draft') vendor — this block is specifically about
      // what stays hidden, not the approved-vendor read paths (those get their own describe
      // block below).
      vendorId = await seedVendor();
      seededVendorIds.push(vendorId);
      authed = await createAuthedTestUser();

      // Seed one real, unexpired checkin as service_role so the anon/authenticated SELECT tests
      // below are proving "RLS hides an existing row for a non-approved vendor", not just "there
      // happen to be no rows".
      const { error } = await serviceRole.from("checkins").insert(validCheckinPayload(vendorId));
      expect(error).toBeNull();
    });

    afterEach(async () => {
      await authed.cleanup();
    });

    it("returns zero rows to anon for a non-approved vendor's checkin", async () => {
      const anon = getAnonClient();
      const { data, error } = await anon
        .from("checkins")
        .select("id")
        .eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("returns zero rows to authenticated for a non-approved vendor's checkin", async () => {
      const { data, error } = await authed.client
        .from("checkins")
        .select("id")
        .eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("rejects an anon INSERT", async () => {
      const anon = getAnonClient();
      const { error } = await anon.from("checkins").insert(validCheckinPayload(vendorId));
      expect(error).not.toBeNull();
    });

    it("rejects an authenticated INSERT from a user who does not own the vendor", async () => {
      // authed does not own vendorId (vendorId was seeded with no owner_user_id override, so
      // it's admin-managed) — this is the negative case for GLPDX-12's vendor-scoped INSERT
      // policy, not a generic deny-all check.
      const { error } = await authed.client
        .from("checkins")
        .insert(validCheckinPayload(vendorId));
      expect(error).not.toBeNull();
    });

    it("service_role still bypasses RLS and can read the seeded row", async () => {
      // Sanity check that the tests above are actually about RLS, not e.g. a broken seed —
      // service_role, which ignores RLS, should always see the row.
      const { data, error } = await serviceRole
        .from("checkins")
        .select("id")
        .eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });

  describe("public read: active checkins for approved vendors (GLPDX-12)", () => {
    it("shows anon an unexpired checkin for an approved vendor", async () => {
      const vendorId = await seedVendor({ status: "approved" });
      seededVendorIds.push(vendorId);
      const { error: insertError } = await serviceRole
        .from("checkins")
        .insert(validCheckinPayload(vendorId));
      expect(insertError).toBeNull();

      const anon = getAnonClient();
      const { data, error } = await anon.from("checkins").select("id").eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides an EXPIRED checkin for an approved vendor that has not opted into show_last_known", async () => {
      const vendorId = await seedVendor({ status: "approved", show_last_known: false });
      seededVendorIds.push(vendorId);
      const { error: insertError } = await serviceRole
        .from("checkins")
        .insert(expiredCheckinPayload(vendorId, new Date(Date.now() - 60 * 60 * 1000)));
      expect(insertError).toBeNull();

      const anon = getAnonClient();
      const { data, error } = await anon.from("checkins").select("id").eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("public read: last-known checkin for opted-in approved vendors (GLPDX-12 / GLPDX-72)", () => {
    it("shows exactly the single most recent expired checkin, not the vendor's full history", async () => {
      const vendorId = await seedVendor({ status: "approved", show_last_known: true });
      seededVendorIds.push(vendorId);

      // Two expired checkins at different times — proves the policy scopes to ONE row (the most
      // recent by expires_at), not "every expired checkin for an opted-in vendor". This is the
      // Option A behavior agreed on for GLPDX-72: a vendor opting into last-known exposes one
      // pin with one timestamp, not their whole location history.
      const older = expiredCheckinPayload(vendorId, new Date(Date.now() - 2 * 60 * 60 * 1000));
      const newer = expiredCheckinPayload(vendorId, new Date(Date.now() - 60 * 60 * 1000));
      const { data: olderRow, error: olderError } = await serviceRole
        .from("checkins")
        .insert(older)
        .select("id")
        .single();
      const { data: newerRow, error: newerError } = await serviceRole
        .from("checkins")
        .insert(newer)
        .select("id")
        .single();
      expect(olderError).toBeNull();
      expect(newerError).toBeNull();

      const anon = getAnonClient();
      const { data, error } = await anon.from("checkins").select("id").eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.id).toBe(newerRow!.id);
      expect(data?.map((row) => row.id)).not.toContain(olderRow!.id);
    });

    it("hides the expired checkin for an approved vendor that has NOT opted into show_last_known", async () => {
      const vendorId = await seedVendor({ status: "approved", show_last_known: false });
      seededVendorIds.push(vendorId);
      const { error: insertError } = await serviceRole
        .from("checkins")
        .insert(expiredCheckinPayload(vendorId, new Date(Date.now() - 60 * 60 * 1000)));
      expect(insertError).toBeNull();

      const anon = getAnonClient();
      const { data, error } = await anon.from("checkins").select("id").eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("vendor-scoped insert (GLPDX-12)", () => {
    let owner: AuthedTestUser;
    let otherUser: AuthedTestUser;

    beforeEach(async () => {
      owner = await createAuthedTestUser();
      otherUser = await createAuthedTestUser();
    });

    afterEach(async () => {
      await owner.cleanup();
      await otherUser.cleanup();
    });

    it("allows a vendor's owner to insert a checkin for their own vendor", async () => {
      const vendorId = await seedVendor({ owner_user_id: owner.user.id });
      seededVendorIds.push(vendorId);

      const { error } = await owner.client.from("checkins").insert(validCheckinPayload(vendorId));
      expect(error).toBeNull();
    });

    it("rejects an authenticated user inserting a checkin for a vendor they do not own", async () => {
      const vendorId = await seedVendor({ owner_user_id: owner.user.id });
      seededVendorIds.push(vendorId);

      const { error } = await otherUser.client
        .from("checkins")
        .insert(validCheckinPayload(vendorId));
      expect(error).not.toBeNull();
    });
  });
});