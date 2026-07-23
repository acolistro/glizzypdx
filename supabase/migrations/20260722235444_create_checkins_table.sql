-- ============================================================================
-- CHECKINS TABLE
-- ============================================================================
-- A checkin is a vendor's manual, time-bounded announcement of where they are
-- right now. There is no automatic location capture anywhere in this table --
-- every row is created by an explicit vendor action, and every row is
-- meaningless once expires_at has passed (that expiry is what the map uses to
-- decide whether a vendor shows as an active green pin at all -- see GLPDX-34).
--
-- vendor_id is NOT NULL: a checkin always belongs to exactly one vendor, and
-- "on delete cascade" means if that vendor row is ever deleted outright, their
-- checkin history is deleted with it -- consistent with the project's "vendors
-- can delete their own checkin history" rule, and with vendor_reports' use of
-- the same cascade pattern in the GLPDX-128 migration.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),

  vendor_id uuid not null references public.vendors(id) on delete cascade,

  -- Where the vendor is right now. double precision (a native float), not
  -- numeric -- this matches what MapLibre and virtually all JS geo libraries
  -- expect natively, avoiding a cast at every read. Precision loss at this
  -- scale is irrelevant for "where's the hotdog cart" accuracy.
  lat double precision not null,
  lng double precision not null,

  -- A short, vendor-authored or reverse-geocoded display label (e.g.
  -- "Alberta Arts"), NOT a full street address. Per GLPDX-150's privacy note,
  -- the raw geocoded address must never persist to the database -- only this
  -- coarse label does. Nullable: a vendor may check in without one.
  area_label text,

  -- When this checkin stops being "active" on the map. This is the ONLY
  -- expiry concept in the schema -- there is deliberately no separate
  -- "open_until" column. The UI-side duration picker (e.g. "checked in until
  -- 5pm") computes this timestamptz value before insert; there is no need to
  -- store the vendor's raw UI input separately from the value that's actually
  -- enforced.
  expires_at timestamptz not null,

  -- Free-text vendor note about this specific checkin, e.g. "at the farmers
  -- market today". Nullable -- most checkins won't need one.
  event_note text,

  created_at timestamptz not null default now()
);

-- Speeds up the two access patterns this table will actually see:
--   1. "all checkins for vendor X" -- used by ON DELETE CASCADE itself, by the
--      vendor deleting their own checkin history (a planned feature), and by
--      GLPDX-12's future vendor-scoped INSERT policy check.
--   2. "checkins that are still active" -- the core query GLPDX-34 (fetch
--      active/last-known checkins for the map) will run on every map load.
-- Both are cheap, standard b-tree indexes; neither depends on anything GLPDX-12
-- or GLPDX-34 will add later, so creating them now in the same migration that
-- creates the table is safe and avoids a follow-up migration just for this.
create index if not exists checkins_vendor_id_idx on public.checkins (vendor_id);
create index if not exists checkins_expires_at_idx on public.checkins (expires_at);

-- Row Level Security is enabled here, in the SAME migration that creates the
-- table, deliberately with NO policies attached yet. Enabling RLS with zero
-- policies means Postgres denies every row to every role except service_role
-- (which bypasses RLS entirely) -- a safe "closed by default" state. This is
-- intentional: it means the table is never left publicly readable/writable
-- in the gap between this migration and GLPDX-12, which adds the actual
-- policies (public read of unexpired checkins for approved vendors,
-- last-known opt-in reads, vendor-scoped insert). GLPDX-161's test suite
-- verifies this deny-all baseline explicitly.
alter table public.checkins enable row level security;

-- ----------------------------------------------------------------------------
-- Grants (standing rule -- GLPDX-140/GLPDX-149)
-- ----------------------------------------------------------------------------
-- CLI/migration-created tables do NOT receive Supabase Dashboard's automatic
-- role grants (see GLPDX-140's root-cause findings) -- these must be set
-- explicitly, in the same migration that creates the table, or the roles
-- below have no access at all regardless of what RLS policies get added
-- later. Kept to the minimum each role actually needs (least privilege):
--   - anon:          SELECT only. Matches every other public-facing table in
--                     this schema -- the public can only ever read.
--   - authenticated:  SELECT + INSERT only. UPDATE/DELETE are deliberately
--                     NOT granted yet -- there is no checkin-edit or
--                     vendor-deletes-own-history feature built yet, and
--                     granting privileges with no matching RLS policy (still
--                     deny-all until GLPDX-12) would just be a dangling,
--                     unused permission. Add UPDATE/DELETE grants in the
--                     migration that actually implements those features.
--   - service_role:   ALL. Bypasses RLS entirely; used by the admin
--                     interface and any server-side logic (Edge Functions),
--                     never by client code directly.
grant select on public.checkins to anon;
grant select, insert on public.checkins to authenticated;
grant all on public.checkins to service_role;