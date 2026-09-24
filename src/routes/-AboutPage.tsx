// AboutPage is the actual content for the /about route (GLPDX-155). It's
// a plain presentational component -- no props, no hooks. There's no
// data to fetch here (this is static site content), so no useState,
// useEffect, or TanStack Query is needed, unlike most of the vendor-map
// feature's components.
//
// Kept out of routes/about.tsx for the same reason -HomePage.tsx is kept
// out of routes/index.tsx: exporting a component directly from a route
// file blocks TanStack Router's automatic code-splitting for that route
// (see -HomePage.tsx's comment). The "-" filename prefix tells the
// router's file-based routing convention to ignore this file entirely --
// it's a plain helper module, not a route.
//
// No CSS module here, matching -HomePage.tsx -- page-level content
// components in this project stay unstyled at this layer; visual styling
// comes from shared tokens/components, not per-page CSS files.
export function AboutPage() {
  return (
    <article>
      {/* h2, not h1 -- RootLayout already renders the page's one <h1>
          ("GlizzyPDX"). Every routed page's own heading nests below
          that, keeping one clean heading hierarchy across the whole
          site rather than competing/duplicate <h1>s. */}
      <h2>About GlizzyPDX</h2>

      <p>
        GlizzyPDX helps you find hotdog vendors in Portland, Oregon —
        mobile carts, stationary carts, and restaurants alike — on a live
        map, without asking you to create an account or sign in.
      </p>

      <p>
        There's no tracking here. GlizzyPDX doesn't use cookies,
        fingerprinting, or analytics that follow individual visitors. You
        can browse the map as a fully anonymous guest, every time you
        visit.
      </p>

      <h3>How vendor visibility works</h3>

      <p>
        Vendors control what the map shows about them. A vendor manually
        checks in when they're open for business, setting their own
        expiry time — there's no automatic or continuous location
        tracking happening in the background. If a vendor opts in, their
        last known location can still be shown (in gray, clearly labeled)
        after their check-in expires, so you can see where they were
        recently — but that display is a choice each vendor makes for
        themselves, never something turned on by default.
      </p>
    </article>
  );
}