// src/features/vendor-map/components/ShowInactiveToggle.tsx
//
// GLPDX-33 (paired test ticket GLPDX-185) — the "show inactive" toggle
// that lets a user opt in to seeing last-known vendor pins on the map.
//
// Where its data comes from: entirely from props. `checked` is passed
// in by a parent component — this component has no internal state of
// its own. That's a deliberate choice (see the "controlled component"
// note below), not an oversight.
//
// Where its output goes: `onChange`'s boolean argument is meant to be
// fed straight into useLastKnownVendorPins(enabled) by whatever parent
// renders this (VendorMapView, GLPDX-33's next piece) — that's the
// "toggle-gated fetch, not client-side filtering" architecture decision
// from GLPDX-33's Jira description. No last-known location data should
// even be requested from Supabase until this toggle is on.
//
// Non-obvious pattern #1 — CONTROLLED COMPONENT: this component holds
// no useState of its own. Its visual checked state always comes from
// the `checked` prop, and every user click calls `onChange` but does
// NOT update anything locally — the parent is responsible for actually
// changing `checked` in response to that call (typically by holding its
// own `const [showInactive, setShowInactive] = useState(false)` and
// passing `checked={showInactive} onChange={setShowInactive}`). This is
// the same "controlled input" pattern React Hook Form uses for form
// fields elsewhere in this project. If you're coming from Android: this
// is similar to a custom View that never stores its own display state,
// only ever reading it from a value the parent Fragment/Activity passes
// in, and reporting user interaction upward via a callback — no
// two-way-binding, single source of truth lives in the parent.
//
// Non-obvious pattern #2 — role="switch" ON A REAL CHECKBOX: a native
// <input type="checkbox"> already gets keyboard support (the Space key
// toggles a focused checkbox) and checked-state announcement to screen
// readers for free from the browser — none of that has to be
// hand-built. Adding role="switch" doesn't change any of that behavior;
// it just tells assistive technology to describe this control as an
// on/off "switch" rather than a generic "checkbox," which is a more
// accurate description of what it actually does (it's not part of a
// group of options being checked off — it's a single binary toggle).
//
// Non-obvious pattern #3 — WRAPPING THE INPUT IN A <label>: nesting the
// <input> directly inside the <label> element (rather than using a
// separate <label htmlFor="some-id"> pointing at an <input id="some-id">
// elsewhere) associates them implicitly — no id/htmlFor bookkeeping
// needed, and clicking the label text anywhere (not just the tiny
// checkbox square itself) toggles the input. This is the simplest
// correct way to make a checkbox's clickable/tappable area bigger,
// which matters here since GLPDX-33's map is a mobile-first UI.

import styles from './ShowInactiveToggle.module.css';

export interface ShowInactiveToggleProps {
  /**
   * Whether the toggle is currently on. Comes from the parent's own
   * state — this component never tracks this itself (see the
   * "controlled component" note above).
   */
  checked: boolean;
  /**
   * Called with the new value every time the user toggles this control
   * (by click or by keyboard). Does not change `checked` itself — the
   * parent must do that in response, typically by passing this function
   * straight as a useState setter.
   */
  onChange: (checked: boolean) => void;
}

export function ShowInactiveToggle({ checked, onChange }: ShowInactiveToggleProps) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        // event.target.checked is the browser's own computed next-state
        // for this checkbox (it flips automatically before this handler
        // runs) — we just read it and hand it upward via onChange rather
        // than computing `!checked` ourselves, which would be one more
        // place a checked/unchecked mismatch could sneak in.
        onChange={(event) => onChange(event.target.checked)}
      />
      Show inactive vendors
    </label>
  );
}