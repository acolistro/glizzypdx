import { createFileRoute } from "@tanstack/react-router";
import { AdminLoginForm } from "../../features/admin/components/AdminLoginForm";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// The actual /admin/login page. Deliberately a SIBLING of the
// admin/_authenticated/ subtree, not a child of it -- this route must
// stay reachable by a visitor with no session at all, which is exactly
// why admin/route.tsx (the shared parent for both this and
// _authenticated/) has no beforeLoad guard on it. See that file's
// comments for the full reasoning.
//
// Thin routing glue only -- the actual form logic lives in
// AdminLoginForm.tsx, tested directly. Excluded from coverage in
// vite.config.ts, same treatment as the other thin route-wiring files.
// -----------------------------------------------------------------------

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginForm,
});