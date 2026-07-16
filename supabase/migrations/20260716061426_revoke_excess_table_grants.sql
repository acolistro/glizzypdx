-- GLPDX-149: Correct table-level grants for anon/authenticated/service_role
--
-- Context: GLPDX-140 established that tables created via CLI migrations never
-- receive the Supabase Dashboard's automatic grants -- that auto-grant is a
-- Dashboard UI behavior, not a Postgres or Supabase platform default. This means
-- every table-creating migration in this project needs its own explicit GRANT
-- statements, or roles get whatever the *default* Postgres privileges happen to
-- be for the role that ran the migration (often broader than intended, and in
-- some cases narrower than intended too -- it's not predictable either way).
--
-- The GLPDX-149 audit ran `information_schema.role_table_grants` against both
-- local and remote (confirmed identical, no drift) and found excess grants
-- that were never explicitly requested by any migration:
--
--   - anon/authenticated had REFERENCES + TRIGGER + TRUNCATE on every table.
--     TRUNCATE is the real risk here: TRUNCATE is not row-level and is NOT
--     gated by Row Level Security at all. RLS only applies to SELECT/INSERT/
--     UPDATE/DELETE. A role with TRUNCATE can wipe an entire table regardless
--     of what RLS policies say. PostgREST does not expose TRUNCATE over the
--     Data API today, so this wasn't currently *exploitable* through the app --
--     but "not reachable today" is not the same as "correctly scoped," and the
--     whole point of this audit is to stop relying on that distinction.
--   - authenticated had REFERENCES/TRIGGER/TRUNCATE on vendor_inquiries and
--     vendor_reports with no corresponding INSERT/SELECT -- i.e. privileges
--     that serve no purpose, since vendors never interact with those tables.
--
-- This migration revokes everything from anon/authenticated/service_role on
-- these three tables, then re-grants only what each role's RLS policies are
-- actually designed around (confirmed against `pg_policies` in the same
-- audit, also identical between local and remote):
--
--   vendor_inquiries:
--     anon           -> INSERT only  (policy: "anyone can submit an inquiry")
--     authenticated  -> nothing       (vendors never touch this table)
--     service_role   -> full CRUD    (admin review/actioning via the app)
--
--   vendor_reports:
--     anon           -> INSERT only  (policy: "anyone can submit a vendor report")
--     authenticated  -> nothing       (vendors never touch this table)
--     service_role   -> full CRUD    (admin review via the app)
--
--   vendors:
--     anon           -> SELECT only  (policy: "public can view approved vendors",
--                                      RLS restricts to status = 'approved')
--     authenticated  -> SELECT, UPDATE  (policies: "vendor can view own profile",
--                                      "vendor can edit own profile as draft or
--                                      submitted" -- RLS blocks self-approval by
--                                      restricting UPDATE's with_check to
--                                      draft/submitted status only)
--     service_role   -> full CRUD    (invite Edge Function creates draft rows,
--                                      admin approval flow updates status)
--
-- Note: REVOKE ALL / re-GRANT is used instead of surgical per-privilege REVOKEs
-- so this file is self-documenting about the full intended state of each role
-- on each table, not just a diff against what happened to exist before.

-- ── vendor_inquiries ──────────────────────────────────────────────────────
revoke all on table public.vendor_inquiries from anon, authenticated, service_role;

grant insert on table public.vendor_inquiries to anon;
grant select, insert, update, delete on table public.vendor_inquiries to service_role;

-- ── vendor_reports ────────────────────────────────────────────────────────
revoke all on table public.vendor_reports from anon, authenticated, service_role;

grant insert on table public.vendor_reports to anon;
grant select, insert, update, delete on table public.vendor_reports to service_role;

-- ── vendors ───────────────────────────────────────────────────────────────
revoke all on table public.vendors from anon, authenticated, service_role;

grant select on table public.vendors to anon;
grant select, update on table public.vendors to authenticated;
grant select, insert, update, delete on table public.vendors to service_role;