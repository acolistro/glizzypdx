-- GLPDX-12 prerequisite: add vendors.show_last_known.
--
-- WHAT THIS MIGRATION DOES:
-- Adds a single boolean column that controls whether a vendor's expired checkins are still
-- shown on the public map as a "last known" pin (gray, with a visible "last active [timestamp]"
-- label) once their active checkin has expired. GLPDX-12's checkins RLS policy reads this
-- column to decide whether to expose an expired checkin row to anonymous readers.
--
-- Defaults to false -- opt-in, per the project's privacy hard rules ("The 'last known' location
-- feature is strictly opt-in and vendor-controlled. It is never automatic."). A vendor who never
-- visits this setting stays fully hidden once their checkin expires, not exposed by default.
--
-- NOT relevant to this migration: the write path (how a vendor actually flips this toggle) is
-- GLPDX-72's scope, not GLPDX-12's or this one's. See the GLPDX-72 comment thread for a known
-- conflict between this column's intended "always vendor-controlled" behavior and the existing
-- "vendor can edit own profile as draft or submitted" UPDATE policy, which would otherwise lock
-- approved vendors out of ever changing it. This migration only adds the column; it does not
-- add or modify any RLS policy.
alter table public.vendors
  add column show_last_known boolean not null default false;