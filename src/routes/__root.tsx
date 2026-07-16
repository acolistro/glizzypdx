import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout } from "../app/RootLayout";

// __root.tsx is a special filename TanStack Router's file-based routing
// convention looks for — it's the one file that uses createRootRoute
// (every other route file uses createFileRoute instead). Every other
// route in src/routes/ nests inside whatever this file renders.
//
// <Outlet /> is TanStack Router's own version of "children go here" —
// it renders whichever child route matched the current URL. This mirrors
// exactly how RootLayout.test.tsx passes plain <p> children directly;
// here, the router supplies them instead of a test.
export const Route = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),

  // Shown when no route in the tree matches the current URL — this is
  // what src/app/router.test.tsx's "falls back to the not-found component"
  // test is checking for.
  notFoundComponent: () => <p>Page not found.</p>,
});