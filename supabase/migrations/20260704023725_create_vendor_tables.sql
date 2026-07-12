-- ============================================================================
-- VENDORS TABLE
-- ============================================================================
-- This is the core table for every hotdog vendor listing that can appear
-- on the public map. A row here can be in one of two "ownership" states:
--   - owner_user_id IS NOT NULL -> a vendor manages this via the portal
--   - owner_user_id IS NULL     -> Alyssa manages this directly as admin
-- Both kinds of rows live in the same table and use the same public map
-- query (status = 'approved'), so the map never needs to know or care
-- which kind of listing it's rendering.
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),

  -- Links this row to a Supabase Auth user (the vendor's login).
  -- NULL means this is an admin-managed listing with no vendor login
  -- attached (e.g. Alyssa added it manually, or a vendor's account was
  -- deleted after repeated failed profile reviews).
  -- "on delete set null" means: if the auth user is ever deleted, this
  -- row survives and just becomes admin-managed instead of being wiped out.
  owner_user_id uuid references auth.users(id) on delete set null,

  -- Where this listing is in the review pipeline. Only Alyssa (via the
  -- admin interface, using the service_role key which bypasses RLS) can
  -- move a row to 'approved' or 'rejected' -- see the RLS policy below,
  -- which prevents a vendor from setting their own status to those values.
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),

  -- Core profile fields a vendor fills in via the portal.
  name text not null,
  description text,
  logo_url text,
  cheapest_price numeric(6, 2), -- e.g. 5.00, stored as dollars.cents
  vegan_options boolean not null default false,

  -- text[] is a native Postgres array column -- think of it like a Kotlin
  -- List<String> stored directly in the row, no separate join table needed
  -- since these are small, unordered tag-like sets.
  allergen_flags text[] not null default '{}',
  payment_methods text[] not null default '{}',

  website text,
  phone text,

  -- Vendor's own opt-in choice for showing a gray "last known" pin after
  -- their active checkin expires. This is a *setting*, separate from the
  -- actual checkin timestamps themselves (which will live in a future
  -- `checkins` table, not part of this migration).
  last_known_opt_in boolean not null default false,

  -- Set by Alyssa when she rejects a submitted profile, so the vendor
  -- knows what to fix. She emails this to them manually (not automated),
  -- but storing it here keeps a record of what was asked for.
  rejection_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automatically keeps updated_at current on every row edit, so we don't
-- have to remember to set it manually in every single UPDATE statement
-- throughout the app. This is a Postgres trigger -- similar in spirit to
-- an Android Room @Update callback, but it runs inside the database
-- itself rather than in application code.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row
  execute function public.set_updated_at();

-- Row Level Security (RLS) is Postgres's built-in per-row permission
-- system. Once enabled, EVERY query against this table -- no matter
-- where it comes from -- is filtered through these policies. This is
-- what actually protects your data; the anon/publishable API key being
-- "public" is fine precisely because RLS is what does the real gatekeeping.
alter table public.vendors enable row level security;

-- The public map only ever sees approved listings. This is the query
-- your anonymous, no-login public users will run.
create policy "public can view approved vendors"
  on public.vendors for select
  to anon
  using (status = 'approved');

-- A logged-in vendor can always see their OWN row, regardless of status --
-- they need to see their draft/submitted/rejected profile while editing it
-- in the portal, not just after it's live.
create policy "vendor can view own profile"
  on public.vendors for select
  to authenticated
  using (owner_user_id = auth.uid());

-- A vendor can update their own row, BUT the "with check" clause below
-- blocks them from writing status = 'approved' or 'rejected' themselves --
-- they can only ever save their own edits as 'draft' or 'submitted'.
-- Only Alyssa, acting through the admin interface with the service_role
-- key (which ignores RLS entirely), can actually move a row to approved
-- or rejected. This is the real enforcement of the "vendor can't
-- self-approve" rule -- it's not just a UI restriction, it's a database one.
create policy "vendor can edit own profile as draft or submitted"
  on public.vendors for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid() and status in ('draft', 'submitted'));

-- Note: there's deliberately no INSERT policy for authenticated or anon
-- users here. The initial draft row for a new vendor gets created by a
-- server-side process when they accept their invite (see GLPDX-51), using
-- the service_role key -- not by the vendor directly inserting a row.
-- There's also no DELETE policy -- only Alyssa, via service_role, can
-- delete a vendor row (e.g. when giving up on an unfixed rejected profile).


-- ============================================================================
-- VENDOR_INQUIRIES TABLE
-- ============================================================================
-- The very first touchpoint in vendor onboarding: a public "I want to be
-- listed" form. Anyone can submit one, but nobody except Alyssa can ever
-- read them back -- this table is intentionally write-only from the
-- outside, which is what keeps submitted contact info private.
create table if not exists public.vendor_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_email text not null,
  message text,

  -- 'new' until Alyssa has acted on it (either sent an invite or rejected
  -- it, at which point rejecting just deletes the row entirely -- see
  -- GLPDX-130). 'actioned' means an invite was sent.
  status text not null default 'new' check (status in ('new', 'actioned')),

  created_at timestamptz not null default now()
);

alter table public.vendor_inquiries enable row level security;

-- Anyone -- including fully anonymous visitors -- can submit an inquiry.
-- "with check (true)" means there's no restriction on what they can
-- insert (beyond the column constraints above, like business_name being
-- required). This is paired with Cloudflare Turnstile at the application
-- layer to keep bots from flooding this table -- RLS alone doesn't stop
-- spam, it only controls who can read/write which rows.
create policy "anyone can submit an inquiry"
  on public.vendor_inquiries for insert
  to anon
  with check (true);

-- No SELECT, UPDATE, or DELETE policy exists for anon or authenticated
-- roles. That's not an oversight -- it's the whole point. Without an
-- explicit policy granting access, RLS defaults to denying it. Only
-- Alyssa, through the admin interface using the service_role key, can
-- ever read these rows.


-- ============================================================================
-- VENDOR_REPORTS TABLE
-- ============================================================================
-- Lets any public visitor flag a vendor's listing (spam, inaccurate info,
-- inappropriate content, etc.). Same write-only shape as vendor_inquiries,
-- for the same reason -- and deliberately has NO automated action tied to
-- report volume. See GLPDX-133 for why: without accounts or tracking of
-- individual visitors, there's no privacy-safe way to tell "50 people
-- flagged this" from "1 person flagged it 50 times," so anything
-- automatic here would be trivial to abuse to knock a vendor off the map.
create table if not exists public.vendor_reports (
  id uuid primary key default gen_random_uuid(),

  -- "on delete cascade" means if a vendor row is ever deleted outright,
  -- any reports about it get cleaned up automatically rather than being
  -- left behind as orphaned rows pointing at nothing.
  vendor_id uuid not null references public.vendors(id) on delete cascade,

  reason text not null,
  note text,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.vendor_reports enable row level security;

-- Same pattern as inquiries: anyone can submit, nobody but Alyssa can read.
create policy "anyone can submit a vendor report"
  on public.vendor_reports for insert
  to anon
  with check (true);