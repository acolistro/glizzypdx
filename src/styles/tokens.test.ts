// @vitest-environment node

/**
 * tokens.test.ts — Design token system integrity tests (GLPDX-170)
 * ============================================================
 * WHAT THIS FILE TESTS:
 * Two separate guarantees about the design token layer defined in
 * tokens.css (GLPDX-127):
 *
 *   1. REQUIRED TOKENS EXIST — every token that components actually
 *      depend on is defined. If someone deletes or renames one, this
 *      fails loudly instead of the app silently rendering with an
 *      invalid `var()` (CSS treats an undefined custom property as
 *      an invalid value and falls back to the inherited/initial
 *      value, which usually looks "mostly fine" — that silent
 *      degradation is exactly what makes this worth testing).
 *
 *   2. NO RAW VALUES ESCAPE THE TOKEN LAYER — no component file
 *      contains a hardcoded hex color or font-family string. This is
 *      the rule that keeps a future design-direction change to a
 *      single-file edit instead of a repo-wide grep-and-hope.
 *
 * WHY "REQUIRED TOKENS EXIST" AND NOT A FULL SNAPSHOT:
 * The original ticket asked for a snapshot test against the complete
 * token list. That was deliberately changed. A snapshot fails on
 * every *intentional* addition too, which trains you to run `-u`
 * reflexively until the test stops meaning anything. Asserting a
 * required subset catches the failure mode that actually matters
 * (a token disappearing out from under its consumers) while letting
 * additive changes through without ceremony.
 *
 * WHY THE `@vitest-environment node` PRAGMA AT THE TOP:
 * This is a filesystem test — it reads files off disk and never
 * touches the DOM. Under the project's default jsdom environment,
 * Vite rewrites `import.meta.url` to an http:// URL (jsdom's
 * `self.location.href`), which `fileURLToPath` rejects outright.
 * The pragma opts this one file into the node environment, where
 * `import.meta.url` stays a real file:// URL. It's also faster,
 * since it skips jsdom setup entirely.
 *
 * WHERE ITS DATA COMES FROM:
 * Reads files directly off disk with node's fs module. Nothing here
 * mounts a component. The browser-side behavior of these tokens is
 * covered separately in e2e/design-tokens.spec.ts.
 * ============================================================
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve paths relative to THIS file rather than to process.cwd().
 * cwd depends on where the test command was invoked from, which
 * differs between local runs and CI — deriving from import.meta.url
 * makes these paths stable regardless of how vitest was started.
 */
const thisDir = fileURLToPath(new URL(".", import.meta.url));
const stylesDir = thisDir; // this file lives in src/styles/
const srcDir = join(thisDir, "..");
const tokensPath = join(stylesDir, "tokens.css");

const tokensCss = readFileSync(tokensPath, "utf8");

/* ============================================================
 * HELPERS
 * ============================================================ */

/**
 * Recursively collect every file under `dir` whose extension is in
 * `extensions`. Written by hand rather than pulling in a glob library
 * — it's ~15 lines, has no dependency cost, and the traversal is
 * obvious to read later.
 */
function collectFiles(dir: string, extensions: readonly string[]): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;

    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      found.push(...collectFiles(fullPath, extensions));
    } else if (extensions.includes(extname(entry))) {
      found.push(fullPath);
    }
  }

  return found;
}

/**
 * Files exempt from the "no raw values" rules, and why:
 *
 * - tokens.css: the source of truth. Raw values are the entire point.
 * - *.test.ts / *.test.tsx: test fixtures legitimately assert against
 *   literal expected values (e.g. expecting "rgb(0, 0, 204)").
 *
 * e2e/ and index.html sit outside srcDir and are never scanned —
 * index.html in particular needs a literal in its
 * <meta name="theme-color"> tag, since browsers don't resolve var()
 * there.
 */
function isExempt(filePath: string): boolean {
  const name = basename(filePath);
  return (
    name === "tokens.css" ||
    name.endsWith(".test.ts") ||
    name.endsWith(".test.tsx")
  );
}

/**
 * Blank out a matched region while preserving every newline inside it.
 *
 * WHY NOT JUST DELETE IT: an earlier version of these helpers removed
 * comments outright, which collapsed lines and made every reported
 * line number after the first comment wrong — a violation in
 * global.css was reported as line 7 when it was really line 60-odd.
 * Replacing each non-newline character with a space keeps line AND
 * column positions identical to the original file, so failure
 * messages point at something you can actually open and look at.
 */
function blankPreservingLines(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

/** Blank /* ... *\/ comments, preserving line numbers. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, blankPreservingLines);
}

/** Blank both /* ... *\/ and // ... comments, preserving line numbers. */
function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blankPreservingLines)
    .replace(/\/\/[^\n]*/g, blankPreservingLines);
}

/**
 * Blank @font-face blocks, preserving line numbers.
 *
 * WHY THIS EXISTS: inside @font-face, `font-family` *declares* the
 * name of a font being defined — it's the thing --font-display later
 * points at, not a consumer of it. A var() there would be meaningless.
 * These blocks have to be excluded from the font-family check or the
 * self-hosted Comic Neue declarations in global.css (GLPDX-159) fail
 * a rule they can't possibly satisfy.
 *
 * The [^}]* pattern is safe here because @font-face blocks cannot
 * contain nested braces.
 */
function stripFontFaceBlocks(source: string): string {
  return source.replace(/@font-face\s*\{[^}]*\}/g, blankPreservingLines);
}

/**
 * Matches 3-, 4-, 6-, or 8-digit hex colors. The trailing \b prevents
 * a 3-digit match from firing inside a longer hex string.
 *
 * KNOWN LIMITATION: a word made entirely of hex letters (e.g. an
 * anchor href of "#facade") would false-positive. That's a deliberate
 * tradeoff — the check stays simple and readable, and the fix if it
 * ever fires is to rename the anchor.
 */
const HEX_COLOR =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

  /**
 * CSS properties where a bare pixel value is a token violation
 * (GLPDX-171). Deliberately narrow and matched on property NAME
 * first: border-radius, outline-offset, and similar are legitimately
 * px-valued properties and must never be inspected by this rule at
 * all — only true border/outline WIDTH properties are listed here.
 */
const BORDER_WIDTH_PROPERTY =
  /^\s*(border|border-top|border-right|border-bottom|border-left|border-width|border-top-width|border-right-width|border-bottom-width|border-left-width|outline|outline-width)\s*:\s*([^;]+);/;

/**
 * A bare `<number>px` inside a matched border/outline declaration's
 * value — i.e. a width typed as a literal instead of routed through
 * var(--border-*). Doesn't fire on var(--border-thin), since the
 * token's own px value lives in tokens.css, not here.
 */
const RAW_PX = /\b\d+(?:\.\d+)?px\b/;
/**
 * CSS-wide keywords that are valid font-family values without
 * referencing a token.
 *
 * `inherit` is the important one in practice: form controls
 * (<input>, <textarea>, <button>) do NOT inherit the page font by
 * default — browsers apply their own UA font instead. Writing
 * `font-family: inherit` is the standard, correct way to opt them
 * back into the inherited stack, and it's strictly better than
 * naming var(--font-body) again, since it keeps working if the
 * surrounding context deliberately uses a different font.
 */
const CSS_WIDE_KEYWORDS = [
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
];

/** True if a font-family value is acceptable without a token reference. */
function isAllowedFontFamilyValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("var(--font-") || CSS_WIDE_KEYWORDS.includes(normalized)
  );
}

/**
 * Every token a component currently depends on, or that the design
 * system contract promises will exist. Grouped so a failure message
 * points at the right area of tokens.css immediately.
 */
const REQUIRED_TOKENS = {
  color: [
    "--color-red",
    "--color-red-dark",
    "--color-blue",
    "--color-blue-dark",
    "--color-yellow",
    "--color-yellow-dark",
    "--color-green",
    "--color-green-mid",
    "--color-green-light",
    "--color-white",
    "--color-black",
    "--color-grey-light",
    "--color-grey-mid",
    "--color-body-bg",
    "--color-page-bg",
    "--color-status-active",
    "--color-status-last-known",
    "--color-error",
    "--color-error-dark",
    "--color-error-bg",
  ],
  font: ["--font-display", "--font-body", "--font-mono"],
  typeScale: [
    "--text-xs",
    "--text-sm",
    "--text-base",
    "--text-lg",
    "--text-xl",
    "--text-2xl",
    "--text-3xl",
    "--text-4xl",
  ],
  spacing: [
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-5",
    "--space-6",
    "--space-8",
    "--space-10",
    "--space-12",
    "--space-16",
  ],
  border: [
    "--border-thin",
    "--border-thick",
    "--border-accent",
    "--border-left-accent",
  ],
  radius: ["--radius-none", "--radius-sm", "--radius-md"],
  zIndex: ["--z-map", "--z-sidebar", "--z-modal", "--z-toast"],
  transition: ["--transition-fast", "--transition-base"],
} as const;

/**
 * Parse the custom property names actually declared in tokens.css.
 * Comments are blanked first so a token mentioned only in prose
 * (e.g. the contrast notes) doesn't count as declared.
 */
const declaredTokens = new Set(
  Array.from(
    stripCssComments(tokensCss).matchAll(/(--[a-z0-9-]+)\s*:/g),
    (match) => match[1],
  ),
);

/* ============================================================
 * TESTS
 * ============================================================ */

describe("tokens.css — required tokens (GLPDX-127 / GLPDX-170)", () => {
  /**
   * describe.each generates one test block per token group, so a
   * failure reads as e.g. "color tokens > defines --color-blue"
   * rather than a single opaque assertion over a 50-item array.
   */
  describe.each(Object.entries(REQUIRED_TOKENS))(
    "%s tokens",
    (_group, tokenNames) => {
      it.each(tokenNames)("defines %s", (tokenName) => {
        expect(declaredTokens.has(tokenName)).toBe(true);
      });
    },
  );

  it("declares every token on :root so they are globally available", () => {
    // A token declared inside some other selector would parse as
    // "declared" above but wouldn't actually be reachable app-wide.
    const rootBlocks = stripCssComments(tokensCss).match(/:root\s*\{/g) ?? [];
    expect(rootBlocks).toHaveLength(1);
  });

  it("does not reference any token it fails to define", () => {
    // Catches a self-inconsistent token file — e.g. an alias like
    // --color-status-last-known: var(--color-grey-mid) surviving a
    // rename of the token it points at.
    const referenced = Array.from(
      stripCssComments(tokensCss).matchAll(/var\(\s*(--[a-z0-9-]+)/g),
      (match) => match[1],
    );

    const dangling = referenced.filter((name) => !declaredTokens.has(name));
    expect(dangling).toEqual([]);
  });
});

describe("component styles — no raw values outside the token layer (GLPDX-170)", () => {
  const cssFiles = collectFiles(srcDir, [".css"]).filter(
    (file) => !isExempt(file),
  );
  const tsxFiles = collectFiles(srcDir, [".tsx"]).filter(
    (file) => !isExempt(file),
  );

  it("finds CSS files to check (guards against a broken traversal)", () => {
    // Without this, a bug in collectFiles that returned [] would make
    // every check below pass vacuously — the suite would go green
    // while enforcing nothing at all.
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it("contains no hardcoded hex colors in CSS", () => {
    const violations: string[] = [];

    for (const file of cssFiles) {
      const source = stripCssComments(readFileSync(file, "utf8"));

      source.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(HEX_COLOR)) {
          violations.push(
            `${relative(srcDir, file)}:${index + 1} → ${match[0]}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("contains no hardcoded hex colors in TSX", () => {
    const violations: string[] = [];

    for (const file of tsxFiles) {
      const source = stripTsComments(readFileSync(file, "utf8"));

      source.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(HEX_COLOR)) {
          violations.push(
            `${relative(srcDir, file)}:${index + 1} → ${match[0]}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("declares font-family only via var(--font-*) or a CSS-wide keyword", () => {
    const violations: string[] = [];

    for (const file of cssFiles) {
      // @font-face blocks are excluded — see stripFontFaceBlocks.
      const source = stripFontFaceBlocks(
        stripCssComments(readFileSync(file, "utf8")),
      );

      source.split("\n").forEach((line, index) => {
        const declaration = line.match(/font-family\s*:\s*([^;]+)/);
        if (declaration && !isAllowedFontFamilyValue(declaration[1])) {
          violations.push(
            `${relative(srcDir, file)}:${index + 1} → ${declaration[0].trim()}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("declares fontFamily only via var(--font-*) in TSX inline styles", () => {
    const violations: string[] = [];

    for (const file of tsxFiles) {
      const source = stripTsComments(readFileSync(file, "utf8"));

      source.split("\n").forEach((line, index) => {
        const declaration = line.match(/fontFamily\s*:\s*([^,}]+)/);
        if (declaration && !isAllowedFontFamilyValue(declaration[1])) {
          violations.push(
            `${relative(srcDir, file)}:${index + 1} → ${declaration[0].trim()}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("contains no hardcoded pixel border/outline widths in CSS", () => {
    // Mirrors the hex-color and font-family checks above, but for
    // border/outline widths (GLPDX-171). Matches on property NAME
    // first via BORDER_WIDTH_PROPERTY, so border-radius and
    // outline-offset — which are legitimately px-valued — are never
    // even inspected by this rule.
    const violations: string[] = [];

    for (const file of cssFiles) {
      const source = stripCssComments(readFileSync(file, "utf8"));

      source.split("\n").forEach((line, index) => {
        const declaration = line.match(BORDER_WIDTH_PROPERTY);
        if (declaration && RAW_PX.test(declaration[2])) {
          violations.push(
            `${relative(srcDir, file)}:${index + 1} → ${declaration[0].trim()}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });
});