/**
 * GLPDX-161: Integration tests for the `checkins` table schema.
 *
 * This is a SCHEMA-CONTRACT test, not a feature/behavior test: it asserts that the database
 * itself — column shape, types, constraints, cascade behavior, and the RLS deny-all baseline —
 * matches what GLPDX-11's migration is supposed to create. It does NOT test any app code; there
 * is no checkins UI or hook yet. That's why it lives in src/test/integration/ (grouped with
 * other schema-contract tests) rather than co-located in a feature folder — see the GLPDX-161
 * discussion for why shared-table schema tests don't fit the feature-co-location rule.
 *
 * TDD status as of writing: this file is expected to FAIL (red) against the current database,
 * because the `checkins` table does not exist yet. GLPDX-11's migration is what will turn every
 * test in this file green. Do not "fix" these tests by loosening their assertions — the fix is
 * the migration.
 *
 * Data flow: each test gets its own Supabase clients from ../integration/clients.ts:
 *   - service_role client: seeds a `vendors` row (checkins needs a valid vendor_id to point at)
 *     and, for the cascade test, deletes it again — this is the only role allowed to write here
 *     freely, since it bypasses RLS entirely.
 *   - anon / authenticated clients: used ONLY to prove the deny-all baseline (zero rows back,
 *     writes rejected) — never to seed data, since that's exactly the access they shouldn't have.
 *
 * Scope note (mirrors the ticket): this file only proves RLS is ON with NO policies. The actual
 * read/write policies (public read of unexpired checkins, vendor-scoped insert, etc.) are
 * GLPDX-12's job and get their own test coverage there.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAuthedTestUser,
  getAnonClient,
  getServiceRoleClient,
  type AuthedTestUser,
} from "./clients";

// The service_role client is reused across every test in this file purely for vendor seeding —
// it never touches the checkins table directly except where a test is explicitly checking
// service_role's own bypass-RLS behavior.
const serviceRole = getServiceRoleClient();

/**
 * Creates a throwaway `vendors` row for a test to attach a checkin to.
 *
 * Data comes from: the `name` column is the ONLY NOT-NULL, no-default column on `vendors`
 * (confirmed against the GLPDX-128 migration) — everything else the test doesn't care about
 * is left to its column default. `owner_user_id` is intentionally left NULL: this makes the
 * seeded vendor admin-managed, which keeps this file from depending on auth-user creation for
 * tests that don't need it (the RLS-deny tests do create their own authenticated user, but
 * separately — see below).
 *
 * Data goes to: the returned `id` is used as `vendor_id` when inserting into `checkins`.
 */
async function seedVendor(): Promise<string> {
  const { data, error } = await serviceRole
    .from("vendors")
    .insert({ name: `Test Vendor ${crypto.randomUUID()}` })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to seed test vendor: ${error?.message ?? "no data returned"}`);
  }
  return data.id as string;
}

/** A minimal, otherwise-valid checkins row shape, reused across the column/constraint tests. */
function validCheckinPayload(vendorId: string) {
  return {
    vendor_id: vendorId,
    lat: 45.5231,
    lng: -122.6765,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
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

  describe("RLS deny-all baseline (no policies until GLPDX-12)", () => {
    let authed: AuthedTestUser;
    let vendorId: string;

    beforeEach(async () => {
      vendorId = await seedVendor();
      seededVendorIds.push(vendorId);
      authed = await createAuthedTestUser();

      // Seed one real checkin as service_role so the anon/authenticated SELECT tests below are
      // proving "RLS hides an existing row", not just "there happen to be no rows".
      const { error } = await serviceRole.from("checkins").insert(validCheckinPayload(vendorId));
      expect(error).toBeNull();
    });

    afterEach(async () => {
      await authed.cleanup();
    });

    it("returns zero rows to anon on SELECT", async () => {
      const anon = getAnonClient();
      const { data, error } = await anon.from("checkins").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("returns zero rows to authenticated on SELECT", async () => {
      const { data, error } = await authed.client.from("checkins").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("rejects an anon INSERT", async () => {
      const anon = getAnonClient();
      const { error } = await anon.from("checkins").insert(validCheckinPayload(vendorId));
      expect(error).not.toBeNull();
    });

    it("rejects an authenticated INSERT", async () => {
      const { error } = await authed.client
        .from("checkins")
        .insert(validCheckinPayload(vendorId));
      expect(error).not.toBeNull();
    });

    it("service_role still bypasses RLS and can read the seeded row", async () => {
      // Sanity check that the deny-all tests above are actually about RLS, not e.g. a broken
      // seed — service_role, which ignores RLS, should always see the row.
      const { data, error } = await serviceRole
        .from("checkins")
        .select("id")
        .eq("vendor_id", vendorId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});