import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "./-AboutPage";

// Registers /about with TanStack Router's file-based routing convention.
// Mirrors routes/index.tsx exactly: this file stays a thin wrapper that
// only wires up which component renders at this path. The route file
// itself must export the component reference here (not define it
// inline) so the router's autoCodeSplitting Vite plugin can split it out
// into its own lazy-loaded chunk -- see -AboutPage.tsx's comment, and
// architecture-and-learnings.md's note that Route.options.component is
// therefore never a raw function reference once the plugin wraps it,
// which is why about.test.tsx's registration check only asserts it's
// defined rather than checking its identity.
export const Route = createFileRoute("/about")({
  component: AboutPage,
});