import { redirect } from "@tanstack/react-router";
import { getAdminSession } from "./getAdminSession";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// The actual access-control decision for /admin (GLPDX-83/85), pulled
// out of the route file itself so it's directly unit-testable (see the
// comment at the top of requireAdminOrRedirect.test.ts for why — this
// project has already hit real friction unit-testing TanStack Router
// route objects directly).
//
// Where its data comes from: getAdminSession(), which reads the current
// Supabase session and checks the admin role.
//
// Where its output goes: called from `src/routes/admin/route.tsx`'s
// `beforeLoad`. If this function throws, TanStack Router catches that
// thrown redirect and navigates the browser there instead of rendering
// the route. If it resolves normally, the router proceeds to render
// /admin as usual.
// -----------------------------------------------------------------------

export async function requireAdminOrRedirect(): Promise<void> {
  const { isAdmin } = await getAdminSession();

  // GLPDX-85: redirect silently to home — no error page, no message
  // revealing that /admin exists or that access was denied. From a
  // non-admin visitor's perspective, this should look identical to
  // /admin simply not being a route at all.
  if (!isAdmin) {
    throw redirect({ to: "/" });
  }

  // isAdmin === true: fall through and let the route render normally.
}