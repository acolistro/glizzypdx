import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdminOrRedirect } from "../../features/admin/lib/requireAdminOrRedirect";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// This is a PATHLESS LAYOUT ROUTE for everything under /admin. Because
// it lives at admin/route.tsx (not admin.tsx), TanStack Router treats it
// as the shared parent for any future admin/* child routes (a dashboard,
// vendor approval queue, etc. — none exist yet, but this structure means
// the access-control check below only has to be written once, here, and
// every child route automatically inherits it. Adding a new admin page
// later means adding a new file under admin/ — no need to repeat the
// beforeLoad check in each one.
//
// `beforeLoad` runs before this route (or any child route under it)
// renders. It has no access to component state/hooks — this is exactly
// why `requireAdminOrRedirect` was written as a plain async function
// rather than a hook (see that file's own comments for the full
// reasoning).
//
// This file is DELIBERATELY NOT unit tested directly — the same
// decision already made for Edge Function `index.ts` entry points
// elsewhere in this project: it's a thin wrapper with no independent
// logic of its own. The actual decision it delegates to
// (`requireAdminOrRedirect`) is fully tested in isolation instead.
// -----------------------------------------------------------------------

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAdminOrRedirect,
  component: AdminLayout,
});

function AdminLayout() {
  // `<Outlet />` is where TanStack Router renders whichever child route
  // matched (e.g. the future admin/index.tsx, admin/vendors.tsx, etc.).
  // No admin-specific chrome (nav, header) yet — nothing has asked for
  // that in any ticket so far; adding it speculatively would be
  // building for a design that doesn't exist yet.
  return <Outlet />;
}