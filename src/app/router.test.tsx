import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { RootLayout } from "./RootLayout";
import { act } from "react";


// IMPORTANT — why this test builds its own router instead of importing
// the real app's route tree:
//
// TanStack Router's file-based routing (the style we're using — see the
// README's "note on routing") works by scanning src/routes/ and having a
// Vite plugin auto-generate routeTree.gen.ts the first time `pnpm dev` or
// `pnpm build` runs. That generated file doesn't exist yet at the point
// these tests are written, because we're following TDD: tests come
// before the implementation and build step that would create it.
//
// So instead, this test constructs a small, throwaway route tree using
// TanStack Router's code-based APIs (createRootRoute/createRoute) purely
// as a test fixture. It reuses the REAL RootLayout component so we're
// still verifying the actual layout shell wraps routed content correctly
// — we're just supplying our own fake pages instead of the real app's
// pages, since this test's job is "does routing + the shell work
// together," not "does any specific real page render."
function buildTestRouter(initialPath: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout>
        <Outlet />
      </RootLayout>
    ),
    notFoundComponent: () => <p>Page not found</p>,
  });

  const pageARoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/page-a",
    component: () => <p>Page A content</p>,
  });

  const pageBRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/page-b",
    component: () => <p>Page B content</p>,
  });

  const routeTree = rootRoute.addChildren([pageARoute, pageBRoute]);

  // createMemoryHistory lets the router run in a test environment with
  // no real browser URL bar — we control the "URL" entirely in-memory,
  // starting it at whatever path each test needs.
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

describe("app routing + layout shell integration", () => {
  it("renders the matching route's component inside the layout shell's main landmark", async () => {
    const router = buildTestRouter("/page-a");
    render(<RouterProvider router={router} />);

    // findByRole waits for async route resolution before asserting —
    // TanStack Router resolves routes asynchronously even for simple
    // in-memory cases, so a plain getByRole here would be flaky.
    const main = await screen.findByRole("main");
    expect(main).toHaveTextContent("Page A content");
  });

  it("renders a different route's component when the path is different", async () => {
    const router = buildTestRouter("/page-b");
    render(<RouterProvider router={router} />);

    const main = await screen.findByRole("main");
    expect(main).toHaveTextContent("Page B content");
  });

  it("falls back to the not-found component for an unmatched path", async () => {
    const router = buildTestRouter("/this-route-does-not-exist");
    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });

  it("navigates between routes without remounting the layout shell (SPA behavior, not a full reload)", async () => {
  const router = buildTestRouter("/page-a");
  render(<RouterProvider router={router} />);

  await screen.findByText("Page A content");
  const bannerBeforeNav = screen.getByRole("banner");

// router.navigate({ to }) is type-checked against the app's REAL route
// tree (registered globally in main.tsx via `declare module ...
// Register`), since that's what makes <Link to="..."> type-safe and
// autocomplete-able everywhere in the actual app. This test's router is
// a separate, throwaway fixture with its own private routes ("/page-a",
// "/page-b") that were never meant to be part of that global
// registration — so calling the type-checked .navigate() here would
// incorrectly check "/page-b" against the real app's route tree instead
// of this fixture's own tree, and fail to compile.
//
// router.history.push() sidesteps that: it just takes a plain string,
// with no route-tree type-checking, which is the right tool for
// navigating a router instance that was never globally registered.
await act(async () => {
  router.history.push("/page-b");
});

  await waitFor(() => {
    expect(screen.getByRole("main")).toHaveTextContent("Page B content");
  });
  expect(screen.getByRole("banner")).toBe(bannerBeforeNav);
  });
});