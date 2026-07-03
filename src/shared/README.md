# Shared

Code that's genuinely used across *multiple* features — generic UI
primitives (buttons, modals, form inputs), cross-cutting hooks, and
utility functions that don't belong to any one feature.

**The bar for putting something here is deliberately high.** Code
should start living inside the feature that first needs it. Only get
promoted to `shared/` once a second, unrelated feature needs the same
thing. Reaching for `shared/` too early is how you end up with a grab-bag
"utils" folder that's really just deferred decision-making about where
things actually belong.

Expected eventual shape:

```
shared/
  components/   <- generic UI: Button, Modal, TextInput, etc.
  hooks/        <- cross-feature hooks, e.g. useMediaQuery
  utils/        <- pure helper functions, e.g. date formatting
```

Empty for now — nothing has been promoted here yet.
