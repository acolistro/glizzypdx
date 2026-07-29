import { createFileRoute, Outlet } from "@tanstack/react-router";

// WHAT THIS FILE DOES: public, unguarded pass-through layout for /admin.
// Exists only so /admin/login can be reached with no session at all.
// The actual admin-only guard lives in admin/_authenticated/route.tsx --
// putting it here instead would lock everyone out of the login page too.
// Excluded from coverage in vite.config.ts -- no independent logic.

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
