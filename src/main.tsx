import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

// TanStack Query needs one shared "client" instance for the whole app —
// it's the thing that actually holds the cache of server data (vendor
// checkins, etc.) and manages refetching/deduping requests. We create it
// once here, outside the component tree, so it survives re-renders.
//
// Options left at their defaults for now. As real queries get built
// (e.g. GLPDX tickets for fetching active vendor checkins), we'll likely
// tune `staleTime` per-query rather than globally, since "how fresh does
// this data need to be" differs a lot between the public map (should feel
// near-live) and less time-sensitive vendor portal data.
const queryClient = new QueryClient();

// createRoot + render is React 18's entry point API (replaces the older
// ReactDOM.render from React 17 and earlier). The `!` after getElementById
// tells TypeScript "trust me, this element exists" — it's safe here
// because index.html always contains <div id="root">.
createRoot(document.getElementById("root")!).render(
  // StrictMode is a development-only wrapper that helps catch bugs by
  // intentionally double-invoking some functions (like component render
  // and effect setup) to surface side effects that aren't properly
  // cleaned up. It has zero effect on the production build.
  <StrictMode>
    {/* QueryClientProvider makes the queryClient above available to any
        component in the tree via TanStack Query's hooks (useQuery,
        useMutation, etc.) without having to pass it down as a prop. */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
