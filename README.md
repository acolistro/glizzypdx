# GlizzyPDX 🌭

A privacy-first mobile web app that helps people in Portland, Oregon find nearby hotdog carts — built for anonymous public users, with full control left in vendors' hands.

**Live site:** [glizzypdx.com](https://glizzypdx.com) *(not yet deployed — see [Deployment](#deployment))*

---

## Table of contents

- [About](#about)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Branching and contribution workflow](#branching-and-contribution-workflow)
- [Project management](#project-management)
- [Deployment](#deployment)
- [Privacy principles](#privacy-principles)
- [License](#license)

---

## About

GlizzyPDX maps mobile hotdog carts around the Portland metro area — the kind of vendor that shows up at events and doesn't have a fixed address. The public map requires no account, no login, and no tracking of any kind.

Vendors control their own visibility entirely. They check in manually when they're open, set an expiry time, and can optionally opt in to showing a "last known" location after their active window closes. Nothing about a vendor's location is ever captured automatically.

This project intentionally avoids any Google product in the stack — no Google Maps, no Google Analytics, no Firebase, no Google Fonts served from Google's CDN — and is built to work correctly on privacy-hardened browsers like Brave and Firefox with strict tracking protection enabled.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend framework | React 19 + TypeScript 6 ([Vite 7](#a-note-on-vite-version)) |
| Styling | CSS Modules (not Tailwind — see note below) |
| Map rendering | [MapLibre GL JS](https://maplibre.org/) v5 |
| Map tiles | Stadia Maps / Protomaps |
| Backend & database | [Supabase](https://supabase.com/) |
| Auth | Supabase Auth (vendor-only — public users are unauthenticated) |
| Hosting | Cloudflare Pages *(planned, not yet configured — see [Deployment](#deployment))* |
| Analytics | Plausible / Umami (cookieless, no individual tracking) |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Unit / integration tests | Vitest 4 + React Testing Library |
| E2E tests | Playwright (Chromium, Firefox, WebKit + 2 mobile viewports) |
| Package manager | pnpm |

**On styling:** Tailwind was considered and deliberately dropped. The site's design direction (GeoCities Hotdog Stand — marquee banners, tiled backgrounds, table-layout feel, beveled borders) is easier and more accurate to hand-write than force into utility classes. Design tokens live as CSS custom properties, referenced by per-component `.module.css` files.

**A note on Vite version:** pinned to Vite 7, not the newest Vite 8. Vite 8 is a recent architectural rewrite (new Rolldown-based bundler) with a known dev-server memory regression — Vite 7 is mature and still receives full security + important-fix support as Vite's "previous major." Worth revisiting in another 6–12 months as Vite 8 matures.

## Architecture

The codebase follows current React idioms rather than porting a layered MVC/MVVM structure from other ecosystems:

- **Feature-based folders, flat co-location** — code is organized by feature (`features/vendor-map/`, `features/vendor-portal/`), not by type. Files for a feature (component, hook, types, test) sit directly alongside each other rather than split into `components/`, `hooks/`, `types/` subfolders — subfolders only get introduced per-feature if that feature grows past ~5 files
- **Custom hooks** for logic separation — e.g. `useVendorCheckin()` — rather than a dedicated ViewModel layer
- **TanStack Query** for all server state — fetching, caching, and syncing data from Supabase
- **Local component state** via `useState`/`useReducer`; no global state library unless a genuine cross-cutting need arises

```
src/
  features/        # one folder per feature, flat co-location within each
    vendor-map/         # (planned — not yet built)
    vendor-portal/       # (planned — not yet built)
  shared/           # code used across 2+ features — bar is deliberately high
  app/              # app-wide wiring: routing, layout, providers
  lib/
    supabase.ts     # Supabase client singleton
  test/
    setup.ts        # Vitest global test setup
```

## Getting started

### Prerequisites

- Node.js 24 (Active LTS) — see `.nvmrc`; recommend managing via [nvm](https://github.com/nvm-sh/nvm)
- [pnpm](https://pnpm.io/) — version is pinned via the `packageManager` field in `package.json`; enable via Corepack (`corepack enable`) or install directly
- A Supabase project (see [Environment variables](#environment-variables)) — not required to run the app today, since no current code depends on it yet, but required before certain features will work

### Installation

```bash
git clone https://github.com/acolistro/glizzypdx.git
cd glizzypdx
nvm use          # picks up Node version from .nvmrc
pnpm install
```

The first install will prompt you to approve `esbuild`'s build script (`pnpm approve-builds`) — this is expected, pnpm blocks postinstall scripts by default as a security measure.

### Running locally

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`.

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `VITE_STADIA_MAPS_API_KEY` | API key for map tile provider *(not yet consumed by any code — reserved for the map feature)* |
| `VITE_ANALYTICS_DOMAIN` | Domain configured in Plausible/Umami *(not yet consumed by any code)* |

`.env` is gitignored and should never be committed. See `.env.example` for the expected shape.

## Available scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the local dev server |
| `pnpm build` | Type-check (`tsc -b`) and produce a production build |
| `pnpm preview` | Preview the production build locally (port 4173) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Run Prettier |
| `pnpm test` | Run unit and integration tests (Vitest, watch mode by default) |
| `pnpm test:ui` | Run Vitest with its interactive UI |
| `pnpm coverage` | Run tests once with a coverage report |
| `pnpm e2e` | Run the Playwright E2E suite against a local production build |

## Testing

This project uses test-driven development with full coverage required for every feature.

- **Unit & integration tests** — Vitest + React Testing Library, colocated with the code they test (`Component.test.tsx` next to `Component.tsx`)
- **E2E tests** — Playwright, run against a real local production build (`pnpm build && pnpm preview`), not the dev server, across 5 targets: Chromium, Firefox, and WebKit desktop, plus Pixel 7 and iPhone 14 mobile viewports
- Coverage thresholds are enforced via `vite.config.ts` (currently 80% lines/functions/statements, 75% branches — placeholder values, to be revisited once a real baseline exists) — `pnpm coverage` fails on its own if coverage drops below them
- **Planned, not yet implemented:** integration tests against a local Supabase instance via Docker, so tests never touch production data. This is the intended approach once Supabase is set up (see open Jira tickets) — not wired in yet

Run the full suite locally before opening a PR:

```bash
pnpm lint
pnpm exec tsc -b
pnpm coverage
pnpm e2e
```

## Continuous integration

GitHub Actions runs on every PR into `main` and every push to `main`:

- **Lint, unit & integration tests** — lint, type-check, and run the Vitest suite with coverage, uploading the coverage report as a build artifact
- **Playwright E2E** *(PRs only)* — installs browsers, builds the app, and runs the full Playwright suite against a local production preview, uploading the HTML report as a build artifact

Both jobs use the pnpm version pinned in `package.json` and the Node version pinned in `.nvmrc`, kept in sync with local development.

## Branching and contribution workflow

This repo uses a **trunk-based workflow**:

- `main` is always deployable and is protected — no direct pushes
- All work happens on short-lived feature branches named after the related Jira ticket: `feature/GLPDX-12-vendor-checkin`
- Open a PR back into `main` referencing the Jira ticket number
- PRs require passing CI checks (lint, type-check, unit/integration tests, E2E) before merge
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `chore:`, `docs:`

## Project management

All work is tracked in Jira under project key **GLPDX** (space: GlizzyPDXSite). Every PR and commit should reference its corresponding ticket number where applicable.

## Deployment

**Not yet configured.** The intent is to deploy via Cloudflare Pages, connected to this repository, with pushes to `main` deploying to production at [glizzypdx.com](https://glizzypdx.com) and every open PR getting its own preview URL. None of that exists yet — there's no Cloudflare Pages project created, no deploy step in CI, and no API token configured. This section will be updated once that work is scoped and done (tracked as a future Jira ticket).

## Privacy principles

These are non-negotiable design constraints for this project:

- Public users are fully anonymous — no accounts, sessions, cookies, or fingerprinting
- Vendor location is never captured automatically — vendors manually check in with an explicit expiry
- "Last known" location display is strictly opt-in and vendor-controlled
- Expired check-in data is deleted, not archived, unless the vendor has opted into last-known display
- Vendors can delete their own check-in history at any time
- No Google products anywhere in the stack
- The site must function correctly on privacy-hardened browsers (Brave, Firefox with strict tracking protection)

## License

Proprietary. All rights reserved. This code is not licensed for reuse, modification, or distribution without explicit permission from the owner.