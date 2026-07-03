# Integrating this scaffold — GLPDX-1

These files are meant to be dropped into your existing `glizzypdx` repo
alongside the README, .gitignore, .env.example, PR template, and CI
workflow from the last session — not to replace them.

## 1. Copy files in
Copy everything in this zip into the root of your local `glizzypdx`
clone. Nothing here should collide with what already exists, with one
exception: check whether your existing `.gitignore` already ignores
`node_modules/`, `dist/`, and `.env` — it should, but confirm before
your first commit so you don't accidentally commit `node_modules`.

## 2. Install dependencies
```bash
pnpm install
```
This reads `package.json` and creates the actual `node_modules/` and a
`pnpm-lock.yaml` — neither exists yet since I can't reach the npm
registry from this sandbox to generate them for you.

## 3. Add Supabase env vars
Your existing `.env.example` needs these two additional keys (grab the
real values from your Supabase project dashboard → Settings → API):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Copy `.env.example` to `.env` and fill in the real values. `.env` should
already be gitignored — never commit it.

## 4. Verify it runs
```bash
pnpm dev        # starts dev server at http://localhost:5173
pnpm test       # runs Vitest — should show 1 passing test (App.test.tsx)
pnpm e2e        # runs Playwright — should show 5 passing (one per browser/viewport)
pnpm lint       # should report no errors
```
If `pnpm dev` throws about missing Supabase env vars, that means step 3
wasn't completed — the app is deliberately built to fail loudly rather
than silently if those are missing (see the comment in src/lib/supabase.ts).

## 5. Check your CI workflow
Your existing GitHub Actions workflow was written before this scaffold
existed. Open it and confirm it:
- Installs with `pnpm install` (not `npm install`/`npm ci`) — if it was
  written generically it may assume npm
- Runs `pnpm lint`, `pnpm test -- --coverage`, and ideally `pnpm build`
  as required checks before merge
- Uses a `pnpm/action-setup` step, since GitHub's runners don't have
  pnpm installed by default the way they have npm

I haven't seen that workflow file in this session, so I can't confirm
its current state — worth a five-minute check before your first PR
against `main`, since branch protection means a broken CI config blocks
every future PR until fixed.

## What's deliberately NOT in this ticket
- Real routing (no `/portal`, `/admin` routes yet) — src/app/README.md
  explains why
- Any real UI/design system — placeholder styles only, GeoCities Hotdog
  Stand tokens are a separate ticket
- Any actual features — src/features/ is empty except a README
  explaining the convention

Flag if you expected any of the above to be part of GLPDX-1 — worth
confirming ticket scope matches before Sprint 1 continues.
