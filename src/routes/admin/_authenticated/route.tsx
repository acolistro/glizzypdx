import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdminOrRedirect } from "../../../features/admin/lib/requireAdminOrRedirect";

// WHAT THIS FILE DOES: pathless layout route wrapping every admin page
// that requires a logged-in admin. beforeLoad delegates to
// requireAdminOrRedirect -- the actual guard logic, tested separately.
// /admin/login sits outside this layout, as a sibling of admin/route.tsx.
// Excluded from coverage in vite.config.ts -- thin wrapper only.

export const Route = createFileRoute("/admin/_authenticated")({
  beforeLoad: requireAdminOrRedirect,
  component: AuthenticatedAdminLayout,
});

function AuthenticatedAdminLayout() {
  return <Outlet />;
}
