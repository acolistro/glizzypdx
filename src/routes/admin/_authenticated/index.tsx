import { createFileRoute } from "@tanstack/react-router";
import { AdminHomePage } from "./-AdminHomePage";

// WHAT THIS FILE DOES: thin routing glue wiring /admin/ to AdminHomePage.
// Moved here from admin/index.tsx during the _authenticated restructure --
// no behavior changed, just its place in the route tree. Access control
// is inherited from admin/_authenticated/route.tsx's beforeLoad.

export const Route = createFileRoute("/admin/_authenticated/")({
  component: AdminHomePage,
});
