/// <reference types="vite/client" />
// This one-line reference pulls in Vite's built-in ambient types.
// Without it, TypeScript wouldn't know what import.meta.env is, or how
// to type non-code imports like `import logo from "./logo.svg"`.
// You generally never touch this file — it's plumbing, not app code.

// GLPDX-7: augments Vite's built-in ImportMetaEnv interface with this
// project's specific VITE_* vars, via TypeScript declaration merging
// (any `interface` with a matching name declared elsewhere gets combined
// automatically — this is how you extend a type you don't own).
//
// Required vars (currently consumed by app code) are typed as `string`.
// Optional vars (not yet consumed by anything — see src/config/env.ts)
// are typed as `string | undefined` via the `?` modifier, since Vite
// simply omits a key from import.meta.env if it's absent from the
// loaded .env file, rather than setting it to an empty value.
//
// IMPORTANT CAVEAT: these types are a compile-time promise only. They
// don't make Vite actually provide a value — if a required var is
// missing from whatever .env file got loaded, TypeScript still thinks
// it's `string`, but the real runtime value is `undefined`. That's why
// src/config/env.ts does its own runtime check on top of these types;
// don't rely on this file alone to catch a missing .env entry.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_TURNSTILE_SITE_KEY: string;
  readonly VITE_STADIA_MAPS_API_KEY?: string;
  readonly VITE_ANALYTICS_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}