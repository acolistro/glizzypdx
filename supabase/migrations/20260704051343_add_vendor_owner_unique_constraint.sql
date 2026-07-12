-- supabase/migrations/<timestamp>_add_vendor_owner_unique_constraint.sql

-- Why this exists: Supabase Auth webhooks are NOT guaranteed exactly-once —
-- a retried delivery could otherwise create two draft `vendors` rows for the
-- same invited user. This constraint makes the database itself the source of
-- truth for "this user already has a vendor row," so the Edge Function can
-- treat a duplicate insert as a harmless no-op instead of needing its own
-- fragile "check-then-insert" race condition.
--
-- Note: a UNIQUE constraint on a nullable column allows multiple NULLs in
-- Postgres (each NULL is treated as distinct). That's exactly what we want —
-- admin-managed vendor rows (owner_user_id = NULL) are unaffected, and only
-- vendor-managed rows (owner_user_id = a real auth.users.id) are constrained
-- to one-per-user.
alter table public.vendors
  add constraint vendors_owner_user_id_key unique (owner_user_id);