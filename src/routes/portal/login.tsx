import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "./-LoginPage";

// Registers /portal/login. Deliberately NOT nested under an
// _authenticated pathless layout -- GLPDX-53 (route protection for
// /portal) hasn't been built yet, so there's no guard to apply. This
// route is public by definition anyway (a logged-out vendor has to be
// able to reach it). Once GLPDX-53 lands, this stays outside the
// guard, mirroring admin/login.tsx's own placement as a sibling of
// admin's _authenticated layout, not a child of it.
export const Route = createFileRoute("/portal/login")({
  component: LoginPage,
});