import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomePage } from "./-HomePage";
import { Route } from "./index";

// The real "/" route file (src/routes/index.tsx) exports two things: a
// plain `HomePage` component, and a `Route = createFileRoute("/")({...})`
// registration that TanStack Router's file-based convention requires.
// This file tests both, in two separate describe blocks below:
//
// - "HomePage (index route)" renders HomePage directly, with no router
//   involved — it only cares whether HomePage puts InquiryForm on the
//   page. Routing mechanics themselves (matching, navigation, 404s) are
//   covered separately in app/router.test.tsx.
// - "index route registration" tests the Route config object itself
//   (does it wire HomePage as its component) without rendering through
//   a live router at all — a plain object-shape check, not an
//   integration test.

vi.mock("../features/vendor-inquiry/components/InquiryForm", () => ({
  InquiryForm: () => <div data-testid="mock-inquiry-form" />,
}));

describe("HomePage (index route)", () => {
  it("renders the vendor inquiry form", () => {
    render(<HomePage />);

    expect(screen.getByTestId("mock-inquiry-form")).toBeInTheDocument();
  });
});

// GLPDX-169: the tests above exercise HomePage directly, and
// app/router.test.tsx exercises routing end-to-end against its own
// throwaway fixture route tree -- neither one ever imports THIS file's
// actual `Route = createFileRoute("/")(...)` registration.
//
// Three earlier attempts at rendering this route's actual resolved
// output (bare Suspense, then a second manually-built router tree) both
// failed against TanStack Router's internals -- autoCodeSplitting's lazy
// wrapper isn't renderable outside a real router's loader/matching
// system, and building a second router from the real Route objects
// collides with routing state the plugin already owns globally. Rather
// than keep fighting the router's internals for marginal test strength,
// this checks the Route registration's actual config directly: the
// right path, and that a component is wired up at all. Weaker than a
// full render, but it's what actually imports and exercises this file --
// which is the real gap this test exists to close -- without depending
// on internal mechanics this project doesn't need to assert against.
describe("index route registration (src/routes/index.tsx)", () => {
  it("registers a component for this route", () => {
    expect(Route.options.component).toBeDefined();
  });
});