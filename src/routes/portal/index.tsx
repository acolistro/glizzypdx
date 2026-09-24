import { createFileRoute } from "@tanstack/react-router";
import { PortalHomePage } from "./-PortalHomePage";

// Registers /portal (nested index route -- note the trailing slash in
// the path string, matching admin/_authenticated/index.tsx's
// convention for a nested index route).
export const Route = createFileRoute("/portal/")({
  component: PortalHomePage,
});