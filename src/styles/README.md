# GlizzyPDX Styles — Design Token System

This directory is the single source of truth for the GeoCities Hotdog Stand
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
  border: 2px solid var(--color-pink-dark);
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

## GeoCities skin constraints — read before styling a new component

- **Comic Sans is display-only.** Use `--font-display` for headings (`h1`,
  or a component's `.heroTitle`-style class) and nothing else. Body copy,
  buttons, form labels, and everything else uses `--font-body`
  (Verdana/Tahoma). Comic Sans as body copy at length is hard to read and
  breaks the "fan page vs. document" distinction the aesthetic depends on.
- **The tiled background lives on `body`, once, in `global.css`.** Don't
  re-implement a tiled/patterned background inside an individual
  component — it's a page-level treatment, not a per-component one.
- **Borders and table-like grid layouts are intentional and visible** —
  this is a deliberate aesthetic choice, not a mistake to "clean up." But
  border *values* (width, color, radius) should always come from tokens,
  never a magic number typed directly into a component's CSS.
- **The structure underneath the skin is modern.** "Mobile-first,
  GeoCities as a skin over Grid/Flexbox" means: build layouts with normal
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
| `--color-grey-mid` on `--color-white` | 4.54:1 | Passes AA (normal text) — this is the tightest margin in the palette, right at the AA floor |
| `--color-pink-dark` on `--color-white` | 5.82:1 | Passes AA |
| `--color-ketchup` on `--color-white` | 5.84:1 | Passes AA |
| `--color-black` on `--color-mustard` | 8.44:1 | Passes AAA |
| `--color-black` on `--color-pink` (pastel as background) | 7.33:1 | Passes AAA |
| `--color-white` on `--color-teal` | 4.77:1 | Passes AA (normal text) |
| `--color-black` on `--color-teal` | 3.65:1 | **Fails AA for normal text** — only passes the 3:1 large-text/UI threshold |
| **`--color-pink` on `--color-white` (as text/UI color)** | **2.37:1** | **Fails AA entirely** |

### The one real failure: `--color-pink`

`--color-pink` (`#E8918A`) is a soft, dusty-rose pastel chosen to read as
the color of an actual hot dog sausage rather than a vibrant magenta.
Used as a **background** it's excellent — 7.33:1 with black text on top,
well past AAA. But like nearly any pale pastel, it's too light to work as
**text**, a link color, an icon color, or a focus/UI-indicator color: at
2.37:1 it fails AA outright. This isn't a flaw specific to this
particular shade — pastels being too light for text-level contrast is
close to a structural fact about pastels in general, not something a
slightly different pastel pick would have avoided.

**Resolution:** `--color-pink` is reserved for backgrounds, borders,
marquee elements, and other non-text/non-indicator UI. Anywhere pink
needs to function as text, a link, or a UI indicator (like the global
focus-visible ring in `global.css`), use `--color-pink-dark` instead — a
deeper rose in the same family, darkened until it clears AA (5.82:1).

### The one conditional case: `--color-teal`

`--color-teal` is used as the body/desktop background. It's safe with
white text on top (4.77:1) but **not** with `--color-black` text on top
(3.65:1, fails normal-text AA). If a future component ever places body
copy directly on a teal surface — a footer strip, a webring-style
element — use white text there, not black, or make sure the text
qualifies as "large text" (18px+ regular or 14px+ bold).

## A note on the spacing scale

`--space-1` through `--space-16` uses a named-multiplier scale (1, 2, 3,
4, 5, 6, 8, 10, 12, 16 — matching each token's 4px-multiple, e.g.
`--space-8` = 32px) rather than 16 literal sequential steps. This was an
assumption made when the ticket's wording was ambiguous between the two;
it follows the same convention as Tailwind's default spacing scale, which
is the most common pattern in the industry. If literal sequential steps
(`--space-7`, `--space-9`, `--space-11`, etc.) turn out to be needed,
they can be added without disrupting anything already using this scale.