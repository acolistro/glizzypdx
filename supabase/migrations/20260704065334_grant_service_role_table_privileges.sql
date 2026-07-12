-- supabase/migrations/<timestamp>_grant_service_role_table_privileges.sql
--
-- WHY THIS EXISTS: RLS policies control which ROWS a role can see or
-- modify, but Postgres separately requires a baseline table-level GRANT
-- before a role can touch a table at all. The original vendor tables
-- migration set up RLS carefully but never granted the underlying table
-- privileges, so every API request — even ones from service_role, which
-- bypasses RLS entirely — was being rejected with "permission denied"
-- before RLS was ever evaluated.
--
-- service_role bypasses RLS but still needs full table access, since it's
-- meant to run admin-level and system-level operations (like this
-- invite-acceptance function) that RLS policies aren't written to allow.
grant select, insert, update, delete on public.vendors to service_role;
grant select, insert, update, delete on public.vendor_inquiries to service_role;
grant select, insert, update, delete on public.vendor_reports to service_role;

-- anon and authenticated still only get grants matching what their RLS
-- policies actually allow — the RLS policies remain the real restriction,
-- these grants just clear the baseline gate so those policies get
-- evaluated at all instead of being blocked upstream.
grant select on public.vendors to anon, authenticated;
grant update on public.vendors to authenticated;
grant insert on public.vendor_inquiries to anon;
grant insert on public.vendor_reports to anon;