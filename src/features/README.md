# Features

This is where the app's actual functionality lives, organized **by
feature**, not by file type. This is the idiomatic React equivalent of
what MVVM's layering gives you on Android — but instead of a global
`viewmodels/`, `models/`, `views/` split, each feature owns its own
slice of everything it needs.

Expected shape of a feature folder, once real features land:

```
features/
  vendor-map/
    VendorMap.tsx           <- the component(s)
    useVendorCheckins.ts    <- custom hook: fetches + shapes data via TanStack Query
    vendorMap.types.ts      <- TypeScript types specific to this feature
    VendorMap.test.tsx      <- test lives next to the code it tests
  vendor-portal/
    ...
```

**Why custom hooks instead of ViewModels:** a hook like
`useVendorCheckins()` plays a similar role to an Android ViewModel — it
owns the logic and state a component needs, keeping the component itself
focused on rendering. The difference is hooks are composable functions,
not classes with a lifecycle tied to a screen. Prefer many small,
focused hooks over one large hook that tries to own an entire feature's
state.

**Why not a global `components/` folder:** grouping by file type means
touching one feature (e.g. the vendor check-in flow) requires jumping
between `components/`, `hooks/`, `types/`, and `tests/` folders that are
each shared across every other feature too. Grouping by feature keeps
everything related to one piece of functionality in one place — you can
delete a feature folder and know you haven't left anything orphaned
elsewhere.

No feature folders exist yet — this file is a placeholder until the
first one (likely `vendor-map`, per the Public Map Experience epic)
lands.
