-- GLPDX-167: Allow approved vendors to write show_last_known without reopening
-- their whole profile to self-edit.
--
-- WHY THE OLD POLICY DOESN'T WORK ANYMORE:
-- The original "vendor can edit own profile as draft or submitted" policy gated ALL
-- self-edits (including this new show_last_known toggle) on status IN ('draft',
-- 'submitted'). That means an approved vendor could never UPDATE their row at all --
-- but per this project's privacy hard rules, show_last_known must stay vendor-
-- controlled at every status, not just pre-approval.
--
-- The tempting fix -- just add a SECOND permissive UPDATE policy scoped to
-- status = 'approved' -- doesn't actually work. Postgres ORs multiple permissive
-- policies together per command: a write is allowed if ANY policy's with_check
-- passes, regardless of which policy's using clause matched the row. Since
-- `authenticated` holds a table-level (not column-scoped) UPDATE grant on vendors,
-- an approved vendor could submit one UPDATE touching both show_last_known and a
-- profile field like `name`. The original policy's check fails (wrong status), but
-- a second "status = approved" policy's check has no idea which columns changed --
-- it would pass, silently letting approved vendors rewrite profile content that's
-- supposed to require going back through review.
--
-- RLS with_check alone can't fix this because it can only see the NEW row, not
-- compare it against OLD -- and "which specific columns changed" is exactly what
-- this decision needs. Only a trigger has both OLD and NEW in scope at once.
--
-- THE FIX: split responsibilities.
--   - RLS keeps its normal job: "is this the vendor's own row?" Nothing more.
--   - A BEFORE UPDATE trigger becomes the sole authority on WHAT a vendor is
--     allowed to change, using an OLD-vs-NEW diff. There's only one UPDATE policy
--     now, so the multiple-permissive-policy OR problem above no longer applies.

-- Drop the old status-gated policy...
drop policy if exists "vendor can edit own profile as draft or submitted" on public.vendors;

-- ...replace with an ownership-only policy. All content restrictions now live
-- entirely in the trigger below, not here.
create policy "vendor can edit own profile"
  on public.vendors for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- The trigger function. Fires BEFORE every UPDATE on vendors, for every row.
-- Postgres runs BEFORE ROW triggers and lets them finish (or abort the whole
-- statement via an exception) before RLS's with_check is evaluated against the
-- final row image -- so raising an exception here stops the write completely,
-- the same as a failed with_check would, just with a more specific error message.
--
-- `set search_path = ''` is the same defensive pattern already used by
-- trigger_vendor_invite_webhook() elsewhere in this schema -- it stops the
-- function from accidentally resolving an unqualified identifier against
-- whatever schema happens to be first on some future caller's search_path.
-- Every reference below is fully schema-qualified as a result (though this
-- function doesn't query any tables directly, so there's little exposure here
-- -- it's just kept consistent with the existing pattern in this codebase).
create or replace function public.enforce_vendor_self_edit_restrictions()
returns trigger as $$
declare
  -- Used only inside the OLD.status = 'rejected' branch below, to avoid writing
  -- the same long OR-chain of "did this column change" checks twice.
  any_profile_field_changed boolean;
begin
  -- auth.role() reflects the Postgres role the CURRENT REQUEST is running as --
  -- 'authenticated' for a real vendor portal request, 'service_role' for
  -- Alyssa's admin flow and the invite Edge Function. service_role already
  -- bypasses RLS entirely (it always has); this trigger deliberately mirrors
  -- that bypass for itself too, rather than accidentally becoming a second,
  -- stricter gate that RLS bypass doesn't help with. Without this check, the
  -- admin approval flow (setting status = 'approved') would be blocked by
  -- Rule 1 below, since the trigger runs regardless of who's asking.
  if auth.role() = 'authenticated' then

    -- Rule 1: a vendor can never set their own status to approved or rejected.
    -- Only Alyssa (via service_role, which skips this whole block) can do that.
    -- This preserves the original policy's "no self-approval" guarantee, which
    -- the new ownership-only RLS policy no longer enforces on its own.
    if NEW.status is distinct from OLD.status and NEW.status in ('approved', 'rejected') then
      raise exception 'Vendors cannot set their own status to approved or rejected'
        using errcode = '42501'; -- insufficient_privilege, matching RLS's own error class
    end if;

    -- Rule 2: once a vendor is approved, show_last_known is the ONLY column they
    -- can still change themselves. Any other profile edit -- including trying to
    -- change status away from 'approved' -- must go back through Alyssa's review
    -- process instead of happening silently.
    if OLD.status = 'approved' then
      if NEW.name is distinct from OLD.name
        or NEW.description is distinct from OLD.description
        or NEW.logo_url is distinct from OLD.logo_url
        or NEW.cheapest_price is distinct from OLD.cheapest_price
        or NEW.vegan_options is distinct from OLD.vegan_options
        or NEW.allergen_flags is distinct from OLD.allergen_flags
        or NEW.payment_methods is distinct from OLD.payment_methods
        or NEW.website is distinct from OLD.website
        or NEW.phone is distinct from OLD.phone
        or NEW.rejection_note is distinct from OLD.rejection_note
        or NEW.status is distinct from OLD.status
        or NEW.owner_user_id is distinct from OLD.owner_user_id
      then
        raise exception 'Approved vendors can only update show_last_known'
          using errcode = '42501';
      end if;
    end if;

    -- Rule 3: preserves an incidental behavior of the OLD policy. Today,
    -- with_check (status in ('draft','submitted')) means a rejected vendor's
    -- edit MUST also move status to draft/submitted in the same UPDATE, or the
    -- whole write is rejected -- RLS can't distinguish "status left unchanged at
    -- rejected" from "status explicitly re-set to rejected." The new
    -- ownership-only policy doesn't replicate that on its own, so this rule
    -- does it explicitly: editing a rejected profile still forces resubmission.
    if OLD.status = 'rejected' then
      any_profile_field_changed := (
        NEW.name is distinct from OLD.name
        or NEW.description is distinct from OLD.description
        or NEW.logo_url is distinct from OLD.logo_url
        or NEW.cheapest_price is distinct from OLD.cheapest_price
        or NEW.vegan_options is distinct from OLD.vegan_options
        or NEW.allergen_flags is distinct from OLD.allergen_flags
        or NEW.payment_methods is distinct from OLD.payment_methods
        or NEW.website is distinct from OLD.website
        or NEW.phone is distinct from OLD.phone
        or NEW.rejection_note is distinct from OLD.rejection_note
        or NEW.show_last_known is distinct from OLD.show_last_known
        or NEW.owner_user_id is distinct from OLD.owner_user_id
      );

      if any_profile_field_changed and NEW.status not in ('draft', 'submitted') then
        raise exception 'Rejected vendor edits must resubmit (status must become draft or submitted)'
          using errcode = '42501';
      end if;
    end if;

  end if;

  return NEW;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists vendors_enforce_self_edit_restrictions on public.vendors;

create trigger vendors_enforce_self_edit_restrictions
  before update on public.vendors
  for each row
  execute function public.enforce_vendor_self_edit_restrictions();

-- No GRANT changes needed here -- this migration only replaces a policy and adds
-- a trigger, it doesn't create a table. The GRANT-statements standing rule
-- (GLPDX-140/149) applies to table-creating migrations only; the existing
-- `grant select, update on table public.vendors to authenticated` from
-- 20260716061426_revoke_excess_table_grants.sql already covers what's needed --
-- column-level access control isn't in play here, the trigger is doing that job.