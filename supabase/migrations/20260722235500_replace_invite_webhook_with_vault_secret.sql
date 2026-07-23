-- GLPDX-163: replace the vendor-invite-acceptance webhook's hardcoded
-- service_role JWT with a Vault-backed, single-purpose shared secret.
--
-- WHAT THIS MIGRATION DOES:
-- Drops the "vendor-invite-acceptance" trigger, which called Supabase's
-- built-in supabase_functions.http_request() wrapper with a production
-- service_role JWT baked in as a literal argument -- readable by anyone
-- with SELECT on pg_trigger or information_schema.triggers, and only
-- rotatable by editing this trigger's definition directly. Replaces it
-- with a custom trigger function that looks up a shared secret from
-- Supabase Vault AT EXECUTION TIME, so the secret's actual value never
-- appears in this file, in git history, or in the trigger's own
-- definition -- only the secret's *name* does.
--
-- MANUAL PREREQUISITE -- READ BEFORE APPLYING:
-- This migration assumes a Vault secret named 'vendor_invite_webhook_secret'
-- already exists on whichever database you're applying this to. That
-- secret must be created by hand, once, directly against each database
-- (local and remote) via the Supabase SQL Editor (or `supabase db execute`
-- against local) -- NEVER by adding a `select vault.create_secret(...)`
-- call to a migration file, since that would just move the plaintext
-- secret from the trigger into git instead of removing it, recreating the
-- exact problem this migration exists to fix.
--
--   -- Run this by hand, once per database, with a freshly generated
--   -- value (e.g. `openssl rand -hex 32` in your terminal):
--   select vault.create_secret(
--     '<paste a freshly generated secret here -- never commit this value>',
--     'vendor_invite_webhook_secret',
--     'Shared secret the vendor-invite-acceptance trigger sends to the
--      handle-vendor-invite Edge Function; verified there in constant
--      time by verify-webhook-secret.ts. See GLPDX-163.'
--   );
--
-- The Edge Function side of this same secret value is set separately,
-- outside of any migration, via:
--   supabase secrets set WEBHOOK_SHARED_SECRET=<same value> --project-ref tvgbnvwogxqgncybmbxt
--
-- and the function must be (re)deployed with --no-verify-jwt.

-- Remove the old trigger. We're replacing the whole mechanism (a
-- different underlying function, a different auth model), not just
-- editing its header value in place.
drop trigger if exists "vendor-invite-acceptance" on auth.users;

-- The new trigger function. SECURITY DEFINER is required so it can read
-- vault.decrypted_secrets, which ordinary roles can't select from -- it
-- runs with the privileges of whoever owns the function (the migration's
-- executing role, typically `postgres`), not the privileges of whatever
-- process triggered the auth.users insert.
--
-- `set search_path = ''` is a deliberate hardening step for any
-- SECURITY DEFINER function: without it, a function is vulnerable to
-- "search path hijacking," where a malicious role creates an object with
-- the same unqualified name as one this function calls, in a schema that
-- appears earlier in the caller's search_path, silently redirecting a
-- call meant for e.g. a trusted function to an attacker-controlled one.
-- Setting an empty search_path forces every reference below to be fully
-- schema-qualified (net.http_post, vault.decrypted_secrets), which this
-- function already does, so nothing about its own logic changes -- it
-- just closes off that entire class of attack. pg_catalog (where
-- jsonb_build_object, row_to_json, etc. live) is always implicitly
-- searched by Postgres regardless of search_path, so built-ins still work.
create or replace function public.trigger_vendor_invite_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
  request_id bigint;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'vendor_invite_webhook_secret';

  -- Fail OPEN here, not closed -- deliberately different from how
  -- verify-webhook-secret.ts behaves on the Edge Function side. This
  -- trigger fires on every single auth.users insert, including ones from
  -- local integration tests (GLPDX-162's createAuthedTestUser()) that
  -- have nothing to do with the invite flow and don't have a local Vault
  -- secret configured. A missing secret here should mean "the webhook
  -- doesn't fire this time," not "user creation itself fails" -- the
  -- original hardcoded-JWT version could never fail this way, since it
  -- had no lookup step at all, and we don't want to introduce a new way
  -- for account creation to break. `raise warning` logs loudly (visible
  -- in `select * from net._http_response order by created desc` context
  -- and Postgres logs) without aborting the transaction.
  if webhook_secret is null then
    raise warning 'vendor_invite_webhook_secret not found in Vault -- skipping vendor-invite-acceptance webhook call';
    return new;
  end if;

  -- Fire the webhook asynchronously via pg_net. NEW is the just-inserted
  -- auth.users row. Body shape matches what index.ts already expects
  -- (payload.record) -- see GLPDX-140 notes: this serializes as
  -- raw_user_meta_data (the Postgres column name), not user_metadata (the
  -- Auth API response shape), because this is a raw row, not an API call.
  select net.http_post(
    url := 'https://tvgbnvwogxqgncybmbxt.supabase.co/functions/v1/handle-vendor-invite',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object('type', 'INSERT', 'table', 'users', 'record', row_to_json(new)),
    timeout_milliseconds := 5000
  ) into request_id;

  return new;
end;
$$;

-- Recreate the trigger under its original name against the new function,
-- so it's still easy to find by name in the Dashboard.
create trigger "vendor-invite-acceptance"
after insert on auth.users
for each row
execute function public.trigger_vendor_invite_webhook();