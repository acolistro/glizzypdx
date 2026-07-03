import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ESLint's newer "flat config" format (a plain array of config objects)
// replaces the older .eslintrc.* JSON/YAML format. This is the current
// standard as of ESLint 9 — flat config is now the default, not opt-in.
export default tseslint.config(
  // Tells ESLint to skip linting the build output folder entirely.
  { ignores: ["dist"] },

  {
    // Applies the recommended base JS rules and TypeScript-aware rules
    // on top of them. `tseslint.configs.recommended` understands TS
    // syntax that plain ESLint would otherwise choke on or ignore.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      // `globals.browser` tells ESLint that things like `window` and
      // `document` are real globals, not undefined variables — since
      // this code runs in a browser, not Node.
      globals: globals.browser,
    },
    plugins: {
      // Catches mistakes specific to React Hooks — e.g. calling a hook
      // conditionally, or missing a dependency in a useEffect array.
      // These bugs are easy to introduce and often silent until runtime.
      "react-hooks": reactHooks,
      // Warns if a file exports something that would break Vite's Fast
      // Refresh (hot reload) — e.g. mixing a component export with a
      // non-component export in the same file.
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
