import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// This is a smoke test — it just proves the component renders without
// throwing and that its key text is present. It exists mainly to verify
// the TESTING PIPELINE ITSELF works (Vitest + jsdom + React Testing
// Library all wired together correctly via vite.config.ts), which is
// part of what GLPDX-1 (bootstrap) needs to prove out.
//
// Real, meaningful tests get written alongside each feature as it's
// built (per project rules: every story has a matching test ticket).
describe("App", () => {
  it("renders the GlizzyPDX heading", () => {
    // `render` mounts the component into a jsdom-simulated DOM.
    render(<App />);

    // `screen` gives us query methods that search that rendered DOM.
    // getByRole is preferred over getByText where possible — it queries
    // by accessibility role (here, a level-1 heading), which doubles as
    // a light accessibility check: if this query fails, it might mean
    // the heading isn't using proper semantic markup.
    expect(
      screen.getByRole("heading", { level: 1, name: /glizzypdx/i }),
    ).toBeInTheDocument();
  });
});
