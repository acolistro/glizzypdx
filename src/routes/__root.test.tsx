// src/routes/__root.test.tsx
//
// WHAT THIS FILE DOES: Tests src/routes/__root.tsx itself. This is the
// one file app/router.test.tsx's own extensive docstring explicitly says
// it does NOT cover -- that test builds its own throwaway root route as
// a fixture (reusing the real RootLayout component, but not this file's
// actual createRootRoute() call). Without this test, __root.tsx's real
// Route registration -- including its notFoundComponent -- was never
// imported by anything.
//
// WHERE ITS DATA COMES FROM: the real `Route` export from __root.tsx.
//
// WHERE ITS DATA GOES: assertions only. The first test deliberately does
// NOT render through React Testing Library's render() -- see the comment
// on that test for why.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Route } from "./__root";
import { RootLayout } from "../app/RootLayout";
import type { ReactElement } from "react";

describe("root route (src/routes/__root.tsx)", () => {
  it("wires RootLayout as the top-level component", () => {
    // Route.options.component is `() => (<RootLayout><Outlet /></RootLayout>)`
    // -- calling it directly gives us the React element it would produce,
    // without needing to render() it through Testing Library. That
    // distinction matters here: <Outlet /> requires a real router context
    // to render successfully, which this unit test deliberately doesn't
    // set up (app/router.test.tsx already covers Outlet's actual routing
    // behavior end-to-end). We're only confirming __root.tsx wires the
    // correct top-level component -- RootLayout -- not exercising what's
    // nested inside it.
    const element = Route.options.component!({} as never);
    expect(element.type).toBe(RootLayout);
  });

  it("renders a 'Page not found.' message for its notFoundComponent", () => {
    // notFoundComponent's actual implementation is `() => <p>Page not
    // found.</p>` -- it takes no props at all, but TanStack Router's
    // type for this slot expects NotFoundRouteProps for the general
    // case (where a route DOES use its props). Casting through
    // `unknown` (not `any`, per this project's no-any rule) down to the
    // zero-arg function this specific component actually is, rather
    // than fabricating a fake props object just to satisfy a type this
    // component doesn't use.
    const NotFound = Route.options.notFoundComponent as unknown as () => ReactElement;
    render(<NotFound />);

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
  });
});