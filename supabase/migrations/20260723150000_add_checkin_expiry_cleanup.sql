-- GLPDX-14: Automatic checkin expiry/deletion.
--
-- Per this project's privacy hard rules: "Expired checkin data should be deleted, not
-- archived, unless the vendor has opted into last known display." Until this migration,
-- expired checkins were only ever hidden from public read via GLPDX-12's RLS policies --
-- the rows themselves stayed in the table indefinitely. This migration makes deletion
-- actually happen, via two independent mechanisms:
--
--   1. cleanup_superseded_checkins (trigger, fires immediately on every new checkin) --
--      the moment a vendor checks in again, any of their OTHER already-expired checkins
--      are deleted right then, regardless of show_last_known. A vendor opted into
--      last-known display only ever has ONE preserved expired row at a time (matching
--      GLPDX-12's "single most recent checkin" read policy) -- once a newer checkin
--      exists, the old one has no reason to survive.
--
--   2. delete_expired_opted_out_checkins() (function, called by pg_cron every 5 minutes)
--      -- catches the case the trigger can't: a vendor who opted OUT of last-known simply
--      stops checking in (cart closes, no new row ever gets inserted to fire the trigger
--      above). This sweep deletes their expired checkins on a schedule instead. It
--      deliberately does NOT touch an opted-in vendor's expired checkin -- that row is
--      only ever removed by the trigger, once superseded, never by this scheduled sweep.
--
-- Together: an opted-out vendor's expired checkin is gone within 5 minutes of expiry.
-- An opted-in vendor's is preserved indefinitely until a newer checkin replaces it, then
-- gone immediately. Neither mechanism ever touches a still-active (unexpired) checkin.

-- ── 1. Supersession trigger ─────────────────────────────────────────────────
-- SECURITY DEFINER: this function's internal DELETE must run with the privileges of
-- its owner (the migration-running role), not the invoking client role. A real vendor
-- inserting their own checkin runs as `authenticated`, which only ever holds SELECT +
-- INSERT on checkins (see 20260722235444_create_checkins_table.sql's grants comment --
-- UPDATE/DELETE were deliberately withheld). Without SECURITY DEFINER, the trigger's
-- DELETE would fail with a permission error the moment a real vendor -- not
-- service_role -- fires it, which is exactly the case this whole feature exists for.
--
-- This stays safe despite the elevated privilege: the DELETE is scoped to
-- `vendor_id = NEW.vendor_id`, and NEW.vendor_id is already constrained by the existing
-- vendor-scoped INSERT policy ("vendor can insert checkins for their own vendor",
-- added in GLPDX-12) to a vendor the inserting user actually owns. A vendor can't reach
-- another vendor's rows through this trigger, elevated privilege or not -- same
-- SECURITY DEFINER + locked search_path pattern already used by
-- is_latest_checkin_for_vendor() and trigger_vendor_invite_webhook() elsewhere in this
-- schema, for the same reason: it's the third case here of "logic needs privilege the
-- calling role intentionally doesn't have, scoped narrowly enough to stay safe."
create or replace function public.cleanup_superseded_checkins()
returns trigger as $$
begin
  -- Only ever deletes rows that are BOTH already expired AND belong to the same vendor
  -- as the checkin that was just inserted. An active (unexpired) checkin is never at
  -- risk here, even if the new row's expires_at happens to be earlier than an existing
  -- active one -- this only cleans up rows that are already meaningless.
  delete from public.checkins
  where vendor_id = NEW.vendor_id
    and id != NEW.id
    and expires_at < now();

  return NEW;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists checkins_cleanup_superseded on public.checkins;

create trigger checkins_cleanup_superseded
  after insert on public.checkins
  for each row
  execute function public.cleanup_superseded_checkins();

-- ── 2. Scheduled cleanup for opted-out vendors ──────────────────────────────
create or replace function public.delete_expired_opted_out_checkins()
returns void as $$
begin
  delete from public.checkins c
  using public.vendors v
  where c.vendor_id = v.id
    and c.expires_at < now()
    and v.show_last_known = false;
end;
$$ language plpgsql set search_path = '';

-- Postgres grants EXECUTE on every new function to PUBLIC by default, which
-- `authenticated` and `anon` inherit through automatically -- exactly the kind of
-- silent over-grant the GLPDX-140/149 audit was built to catch, just for functions
-- instead of tables. Revoke that default explicitly, then grant only to service_role
-- (the role both the admin flow and, functionally, pg_cron jobs run as). Neither anon
-- nor authenticated has any legitimate reason to trigger this sweep directly.
revoke all on function public.delete_expired_opted_out_checkins() from public;
grant execute on function public.delete_expired_opted_out_checkins() to service_role;

-- ── 3. pg_cron schedule ──────────────────────────────────────────────────────
-- Supabase's convention is to install pg_cron into a dedicated `extensions` schema
-- rather than `public`, keeping extension-created objects out of the app's own schema.
create extension if not exists pg_cron with schema extensions;

-- cron.schedule() upserts by job name -- re-running this migration (e.g. via
-- `supabase db reset` locally) updates the existing job in place rather than erroring
-- on a duplicate, so this is safe to apply repeatedly.
select cron.schedule(
  'delete-expired-opted-out-checkins',
  '*/5 * * * *', -- every 5 minutes
  $$select public.delete_expired_opted_out_checkins();$$
);