-- ============================================================================
-- CHECKINS RLS POLICIES (GLPDX-12)
-- ============================================================================
-- checkins.sql (20260722235444_create_checkins_table.sql) enabled RLS with NO
-- policies attached, deliberately leaving the table deny-all until this
-- migration. GLPDX-161's test suite proves that deny-all baseline; GLPDX-12's
-- own tests (added alongside this migration, in
-- checkins.schema.integration.test.ts) prove the three policies below.
--
-- Three policies, matching the three access patterns the product actually
-- needs:
--   1. Public read of unexpired ("active") checkins, scoped to approved
--      vendors only.
--   2. Public read of a SINGLE last-known checkin per vendor, only for
--      vendors that are both approved AND have opted into show_last_known.
--   3. Vendor-scoped INSERT: a vendor can only create a checkin for a
--      vendor_id they actually own.
--
-- Postgres RLS note: multiple permissive policies for the same command
-- (here, two SELECT policies) are combined with OR, not AND. That's exactly
-- what's wanted here -- a row is visible if it satisfies EITHER "it's an
-- active checkin for an approved vendor" OR "it's the one last-known checkin
-- for an approved, opted-in vendor". Nothing scopes policy 2 down using
-- policy 1's expiry condition, so policy 2 has to fully self-scope, which is
-- why it also filters to a single row per vendor below (see GLPDX-72
-- discussion: without that self-scoping, "opted into last-known" would leak
-- a vendor's ENTIRE checkin history, not just their most recent pin).
create policy "public can view active checkins for approved vendors"
  on public.checkins for select
  to anon, authenticated
  using (
    expires_at > now()
    and exists (
      select 1 from public.vendors v
      where v.id = checkins.vendor_id
      and v.status = 'approved'
    )
  );

-- A checkins SELECT policy that queries checkins itself in a subquery causes
-- Postgres to re-evaluate the same policy to answer that subquery -- which
-- re-triggers the subquery -- and Postgres detects the resulting infinite
-- recursion and errors (42P17) rather than actually looping forever. The fix
-- is to pull the self-referential lookup out into a SECURITY DEFINER
-- function: such a function runs with the privileges of its OWNER (here, the
-- migration-running role, which owns the table and therefore bypasses RLS on
-- it), so the query inside the function does NOT go through the checkins
-- policies at all -- breaking the recursion. This is the same pattern already
-- used for public.trigger_vendor_invite_webhook() elsewhere in this schema.
-- `set search_path = ''` (also matching that existing pattern) forces every
-- identifier inside to be schema-qualified, closing the "search_path
-- injection" hole SECURITY DEFINER functions are otherwise prone to.
create or replace function public.is_latest_checkin_for_vendor(target_checkin_id uuid, target_vendor_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select target_checkin_id = (
    select c2.id from public.checkins c2
    where c2.vendor_id = target_vendor_id
    order by c2.expires_at desc
    limit 1
  );
$$;

-- anon/authenticated need EXECUTE to call this from within their own SELECT
-- policy below -- functions are not implicitly callable just because a role
-- can query the table the function happens to touch internally.
grant execute on function public.is_latest_checkin_for_vendor(uuid, uuid) to anon, authenticated;

-- Scoped to exactly the single MOST RECENT checkin per vendor (by expires_at)
-- -- not "all expired checkins for an opted-in vendor" -- via
-- is_latest_checkin_for_vendor() above. This is what keeps "last known" to
-- one gray pin with one timestamp, matching the product spec, rather than
-- exposing a vendor's full location history the moment they flip one
-- opt-in setting.
--
-- Does NOT filter on expires_at itself: an opted-in approved vendor's most
-- recent checkin is visible via this policy whether it's expired or still
-- active -- if it's still active, policy 1 above already shows it anyway
-- (the two policies OR together), so this policy overlapping with policy 1
-- for an active checkin is harmless, not a bug.
create policy "public can view last known checkin for opted-in vendors"
  on public.checkins for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = checkins.vendor_id
      and v.status = 'approved'
      and v.show_last_known = true
    )
    and public.is_latest_checkin_for_vendor(checkins.id, checkins.vendor_id)
  );

-- A vendor may only INSERT a checkin for a vendor_id they actually own.
-- Deliberately does NOT restrict on vendors.status -- a vendor still
-- building/resubmitting their profile (draft/submitted) can still check in;
-- status only controls whether the checkin becomes publicly VISIBLE via the
-- two SELECT policies above, which both require status = 'approved'. This
-- also means a rejected vendor with a still-live owner_user_id could
-- technically insert (invisible) checkins -- acceptable, since the real
-- gate on public visibility is the SELECT policies, not this one.
create policy "vendor can insert own checkins"
  on public.checkins for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = checkins.vendor_id
      and v.owner_user_id = auth.uid()
    )
  );