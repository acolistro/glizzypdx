# GlizzyPDX 🌭

A privacy-first mobile web app that helps people in Portland, Oregon find nearby hotdog carts — built for anonymous public users, with full control left in vendors' hands.

**Live site:** [glizzypdx.com](https://glizzypdx.com)

---

## Table of contents

- [About](#about)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Testing](#testing)
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
| Frontend framework | React + TypeScript (Vite) |
| Map rendering | [MapLibre GL JS](https://maplibre.org/) |
| Map tiles | Stadia Maps / Protomaps |
| Backend & database | [Supabase](https://supabase.com/) |
| Auth | Supabase Auth (vendor-only — public users are unauthenticated) |
| Hosting | Cloudflare Pages |
| Analytics | Plausible / Umami (cookieless, no individual tracking) |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Unit / integration tests | Vitest + React Testing Library |
| E2E tests | Playwright (Chromium, Firefox, WebKit) |

## Architecture

The codebase follows current React idioms rather than porting a layered MVC/MVVM structure from other ecosystems:

- **Feature-based folders** — code is organized by feature (`features/vendor-map/`, `features/vendor-portal/`, `features/admin/`), not by type
- **Custom hooks** for logic separation — e.g. `useVendorCheckin()` — rather than a dedicated ViewModel layer
- **TanStack Query** for all server state — fetching, caching, and syncing data from Supabase
- **Local component state** via `useState`/`useReducer`; no global state library unless a genuine cross-cutting need arises

```
src/
  features/
    vendor-map/
    vendor-portal/
    admin/
  shared/
    components/
    hooks/
    types/
  lib/
    supabase.ts
```

## Getting started

### Prerequisites

- Node.js 20+
- npm
- A Supabase project (see [Environment variables](#environment-variables))

### Installation

```bash
git clone https://github.com/<your-username>/glizzypdx.git
cd glizzypdx
npm install
```

### Running locally

```bash
npm run dev
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
| `VITE_STADIA_MAPS_API_KEY` | API key for map tile provider |
| `VITE_ANALYTICS_DOMAIN` | Domain configured in Plausible/Umami |

`.env` is gitignored and should never be committed. See `.env.example` for the expected shape.

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit and integration tests (Vitest) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright E2E suite |

## Testing

This project uses test-driven development with full coverage required for every feature.

- **Unit & integration tests** — Vitest + React Testing Library, colocated with the code they test (`Component.test.tsx` next to `Component.tsx`)
- **Integration tests touching the database** run against a local Supabase instance via Docker — production data is never used in tests
- **E2E tests** — Playwright, run against Chromium, Firefox, and WebKit, with mobile viewport coverage since this is a mobile-first app
- Coverage thresholds are enforced in CI; a PR cannot merge if coverage drops below the agreed threshold

Run the full suite locally before opening a PR:

```bash
npm run test
npm run test:e2e
```

## Branching and contribution workflow

This repo uses a **trunk-based workflow**:

- `main` is always deployable and is protected — no direct pushes
- All work happens on short-lived feature branches named after the related Jira ticket: `feature/GLPDX-12-vendor-checkin`
- Open a PR back into `main` referencing the Jira ticket number
- PRs require passing CI checks (lint, unit/integration tests) before merge
- Cloudflare Pages generates a preview deployment per PR
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `chore:`, `docs:`

## Project management

All work is tracked in Jira under project key **GLPDX** (space: GlizzyPDXSite). Every PR and commit should reference its corresponding ticket number where applicable.

## Deployment

The site is deployed via **Cloudflare Pages**, connected to this repository. Pushes to `main` deploy to production at [glizzypdx.com](https://glizzypdx.com). Every open PR gets its own preview URL.

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
