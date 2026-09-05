// src/features/vendor-map/components/ShowInactiveToggle.test.tsx
//
// GLPDX-33 (paired test ticket GLPDX-185) — the "show inactive" toggle
// that controls whether last-known vendor pins are fetched and shown on
// the public map.
//
// Where the data comes from: this component takes no data of its own.
// It's a controlled, presentational component — `checked` is passed in
// by a parent (VendorMapView, not yet built) that owns the actual
// useState, and `onChange` is called with the new boolean whenever the
// user toggles it. This mirrors the pattern used for form fields
// elsewhere in the project (e.g. React Hook Form's controlled inputs) —
// the component itself holds no state, making it trivial to test in
// isolation and trivial for a parent to wire into TanStack Query's
// `enabled` option (useLastKnownVendorPins(enabled)).
//
// Where its output goes: onChange's boolean argument is what a parent
// will eventually feed into useLastKnownVendorPins(enabled) — see
// GLPDX-33's Jira description for the toggle-gated-fetch architecture
// decision this exists to support.
//
// Non-obvious pattern: a native <input type="checkbox" role="switch">,
// not a <button aria-pressed>. A real checkbox gets keyboard support
// (Space toggles it) and screen-reader state announcement for free from
// the browser — role="switch" just tells assistive tech to announce it
// as an on/off switch (which is what it semantically is) rather than as
// a generic checkbox. This is why the tests below query by
// `getByRole('switch', ...)` rather than `getByRole('checkbox', ...)`.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShowInactiveToggle } from "./ShowInactiveToggle";

describe("ShowInactiveToggle", () => {
  it("renders as an accessible switch with a label describing what it controls", () => {
    render(<ShowInactiveToggle checked={false} onChange={vi.fn()} />);

    // Querying by accessible role+name (not by test id or class name) is
    // deliberate: it's the same check a screen reader user's experience
    // depends on. If this query fails, a real assistive-tech user
    // wouldn't be able to find or understand this control either.
    expect(
      screen.getByRole("switch", { name: /show inactive/i })
    ).toBeInTheDocument();
  });

  it("reflects the checked prop as the switch's checked state", () => {
    const { rerender } = render(
      <ShowInactiveToggle checked={false} onChange={vi.fn()} />
    );

    expect(screen.getByRole("switch", { name: /show inactive/i })).not.toBeChecked();

    // Re-rendering with a new `checked` prop, rather than clicking,
    // proves this component is genuinely controlled — its visual state
    // follows the prop, not some internal state that happens to start
    // in sync with it.
    rerender(<ShowInactiveToggle checked={true} onChange={vi.fn()} />);

    expect(screen.getByRole("switch", { name: /show inactive/i })).toBeChecked();
  });

  it("calls onChange with true when clicked while unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ShowInactiveToggle checked={false} onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: /show inactive/i }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when clicked while checked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ShowInactiveToggle checked={true} onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: /show inactive/i }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not change its own displayed state when clicked — the parent owns state, not this component", async () => {
    // This is the test that would fail first if ShowInactiveToggle were
    // accidentally built as an uncontrolled component with its own
    // internal useState instead of a controlled one. Clicking it here
    // deliberately does NOT update the `checked` prop (this test never
    // re-renders with a new prop), so if the switch's visual checked
    // state changed anyway, that would mean it's tracking its own
    // internal state rather than trusting the prop — which would make
    // it impossible for a parent to be the single source of truth for
    // whether the last-known-pins query is enabled.
    const user = userEvent.setup();
    render(<ShowInactiveToggle checked={false} onChange={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: /show inactive/i });
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
  });

  it("is keyboard operable — pressing Space while focused toggles it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ShowInactiveToggle checked={false} onChange={onChange} />);

    const toggle = screen.getByRole("switch", { name: /show inactive/i });
    toggle.focus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(true);
  });
});