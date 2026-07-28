import { createFileRoute } from "@tanstack/react-router";
import { AdminHomePage } from "./-AdminHomePage";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Thin routing glue only -- wires the /admin/ path to the AdminHomePage
// component defined in -AdminHomePage.tsx. No logic of its own to test;
// the actual rendered content is tested directly via
// -AdminHomePage.test.tsx instead. Excluded from coverage in
// vite.config.ts for the same reason as admin/route.tsx.
//
// Access control is NOT re-checked here -- it's inherited from the
// parent admin/route.tsx's beforeLoad, since this route renders inside
// that layout's <Outlet />.
// -----------------------------------------------------------------------

export const Route = createFileRoute("/admin/")({
  component: AdminHomePage,
});