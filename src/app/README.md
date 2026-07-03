# App

App-wide wiring that isn't specific to any one feature: routing
configuration, top-level layout, and any provider components beyond the
ones already set up directly in `main.tsx` (QueryClientProvider, etc.).

This is where a future `router.tsx` will live once routing is added
(needed once the public map, `/portal`, and `/admin` all need to exist
as distinct routes — currently out of scope for GLPDX-1).

Empty for now — `App.tsx` at the src root is still just a placeholder
and hasn't been broken out into real routing yet.
