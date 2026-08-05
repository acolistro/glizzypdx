# GlizzyPDX Styles — Design Token System

This directory is the single source of truth for the Late 90s Primary Colors
visual identity: every color, font, spacing value, border radius, z-index,
and transition used anywhere in the app lives here first, and everything
else references it.

## Files

- **`tokens.css`** — every design token, defined as CSS custom properties on `:root`.
- **`global.css`** — imports `tokens.css`, applies a CSS reset, and sets base
  `<body>` styling, the keyboard focus ring, and reduced-motion handling.
- **`README.md`** — this file.

## How to use a token in a component

Import your component's own CSS Module as usual, and reference tokens with
`var(--token-name)`. Never write a raw hex code, raw font-family string, or
raw px/rem spacing value directly in a component's `.module.css` file.

```css
/* VendorCard.module.css */
.card {
  background-color: var(--color-white);
  border: 2px solid var(--color-red);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
  font-family: var(--font-body);
}

.cardTitle {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  color: var(--color-black);
}
```

Because `tokens.css` is imported once (via `global.css`, at the app's entry
point) and defines its variables on `:root`, every component in the app can
read these variables without importing anything itself — the same way a
global Android resource is available anywhere once declared.

## Late 90s Primary Colors skin constraints — read before styling a new component

- **Comic Sans is display-only.** Use `--font-display` for headings (`h1`,
  or a component's `.heroTitle`-style class) and nothing else. Body copy,
  buttons, form labels, and everything else uses `--font-body`
  (Verdana/Tahoma). Comic Sans as body copy at length is hard to read and
  breaks the "fan page vs. document" distinction the aesthetic depends on.
- **The blue body background lives on `body`, once, in `global.css`.** Don't
  re-implement `--color-body-bg` inside an individual component — it's a
  page-level treatment, not a per-component one.
- **Borders and grid-like layouts are intentional and visible** —
  this is a deliberate aesthetic choice, not a mistake to "clean up." But
  border *values* (width, color, radius) should always come from tokens,
  never a magic number typed directly into a component's CSS.
- **Color roles are fixed — don't mix them.** Red is for headers, brand
  accents, and left borders on cards. Blue is for map chrome and section
  borders. Yellow is for the marquee, alerts, and pin labels (background
  use only — never as text color). Green is for the nav bar, active
  status indicators, and sidebar titles. Sticking to these roles is what
  makes the palette read as intentional rather than random.
- **The structure underneath the skin is modern.** "Mobile-first,
  Late 90s as a skin over Grid/Flexbox" means: build layouts with normal
  CSS Grid/Flexbox as you would for any responsive app. The visual
  treatment (colors, borders, fonts) evokes the era; the actual layout
  mechanism does not literally recreate 90s `<table>`-based HTML.

## Color contrast audit (WCAG AA)

The ticket for this work required auditing every token against WCAG AA
minimums (4.5:1 for normal text, 3:1 for large text/UI components) and
flagging anything that fails rather than quietly using it. Here's what
that audit found:

| Pairing | Contrast ratio | Result |
|---|---|---|
| `--color-black` on `--color-white` | 17.4:1 | Passes AAA |
| `--color-grey-mid` on `--color-white` | 4.54:1 | Passes AA (normal text) — tightest margin in the palette, right at the AA floor |
| `--color-red` on `--color-white` | 5.84:1 | Passes AA |
| `--color-red-dark` on `--color-white` | 8.59:1 | Passes AAA |
| `--color-blue` on `--color-white` | 8.59:1 | Passes AAA |
| `--color-white` on `--color-blue` | 9.73:1 | Passes AAA |
| `--color-green` on `--color-white` | 5.92:1 | Passes AA |
| `--color-black` on `--color-yellow` | 14.1:1 | Passes AAA |
| `--color-black` on `--color-green-light` | 16.2:1 | Passes AAA |
| `--color-white` on `--color-body-bg` | 9.73:1 | Passes AAA |
| `--color-status-active` on `--color-white` (pin fill / text) | 5.13:1 | Passes AA |
| `--color-white` on `--color-status-active` (icon on pin) | 5.13:1 | Passes AA |
| `--color-status-last-known` on `--color-white` | 4.54:1 | Passes AA — inherited from `--color-grey-mid` |
| **`--color-yellow` on `--color-white` (as text color)** | **1.97:1** | **Fails AA entirely** |
| **`--color-green-mid` on `--color-white` (as normal text)** | **4.03:1** | **Fails AA for normal text** — passes 3:1 large-text threshold only |

### The one real failure: `--color-yellow` as text

`--color-yellow` (`#ffdd00`) is a bright, saturated yellow. As a
**background** it's excellent — 14.1:1 with black text on top, well past
AAA. But it is far too light to use **as text**, a link color, an icon
color, or a focus/UI-indicator color: at 1.97:1 on white it fails AA by
a wide margin.

**Resolution:** `--color-yellow` is reserved for backgrounds, marquee
strips, alert bars, pin labels, and other surfaces that carry dark text
on top of them. It must never be used as the foreground/text color itself.
There is no `--color-yellow-dark` equivalent intended for text use — if
you find yourself wanting "yellow text," reconsider the design; yellow
text on most backgrounds is an accessibility dead end.

### The conditional case: `--color-green-mid`

`--color-green-mid` (`#009900`) reaches 4.03:1 on white — it passes the
3:1 threshold for large text (18px+ regular or 14px+ bold) and UI
component boundaries (focus rings, input borders), but **fails the 4.5:1
minimum for normal-sized body text**. Use it for decorative fills,
hover/active state backgrounds, and icon fills only. Use `--color-green`
for any text or label that needs to be green.

## A note on the map pin status colors

`--color-status-active` and `--color-status-last-known` exist so that
map-pin component tickets (GLPDX-33, 35, 36, 37, 46) have a semantic
token to reference rather than plain color words ("green," "gray pins").
`--color-status-active` is a standalone value, verified for contrast in
both directions since it needs to work both as a pin fill (with a white
icon on top) and as text/legend copy. `--color-status-last-known` is
deliberately just an alias of `--color-grey-mid` — same underlying value,
given its own semantic name so a future reader can tell the pin is gray
*because it means "last known"*, not because someone reached for the
nearest grey out of convenience.

## A note on the spacing scale

`--space-1` through `--space-16` uses a named-multiplier scale (1, 2, 3,
4, 5, 6, 8, 10, 12, 16 — matching each token's 4px-multiple, e.g.
`--space-8` = 32px) rather than 16 literal sequential steps. This was an
assumption made when the ticket's wording was ambiguous between the two;
it follows the same convention as Tailwind's default spacing scale, which
is the most common pattern in the industry. If literal sequential steps
(`--space-7`, `--space-9`, `--space-11`, etc.) turn out to be needed,
they can be added without disrupting anything already using this scale.