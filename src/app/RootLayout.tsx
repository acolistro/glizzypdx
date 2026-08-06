import type { ReactNode } from "react";
import styles from "./RootLayout.module.css";

interface RootLayoutProps {
  // Whatever the router decides to render for the current route gets
  // passed in here as `children`. RootLayout doesn't know or care what
  // that content is — its only job is to wrap it in the site's page
  // chrome (marquee header, nav, hit counter, webring footer). This
  // keeps RootLayout fully decoupled from routing itself, which is what
  // let RootLayout.test.tsx test it without any router setup at all.
  children: ReactNode;
}

export function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className={styles.page} data-testid="page-wrapper">
      {/* A top-level <header> (not nested inside <article>/<section>/etc.)
          is automatically exposed to assistive tech as ARIA role "banner"
          — that's what RootLayout.test.tsx's getByRole("banner") finds.
          No manual role="banner" needed; semantic HTML gives it to us
          for free, which is also better for accessibility than a <div>
          with a role slapped on. */}
      <header className={styles.marquee}>
        {/* Every page needs exactly one <h1> — this is it. Kept short and
            identifying (the site name), per semantic HTML best practice,
            rather than the full welcome sentence. That sentence moves to
            a plain tagline paragraph below it instead. */}
        <h1 className={styles.siteTitle}>GlizzyPDX 🌭</h1>
        <p className={styles.tagline}>
          Welcome to GlizzyPDX — Find Portland's Best Hotdog Carts!
        </p>
      </header>

      {/* Same idea as <header>: a top-level <main> is implicitly ARIA
          role "main". This is where routed page content actually lands. */}
      <main className={styles.content}>{children}</main>

      {/* And a top-level <footer> is implicitly ARIA role "contentinfo". */}
      <footer className={styles.footer}>
        <p className={styles.hitCounter}>Visitors: 000001</p>
        <p className={styles.webring}>
          <a href="#">← Prev site</a> | Hotdog WebRing |{" "}
          <a href="#">Next site →</a>
        </p>
      </footer>

      {/* GLPDX-171: the mobile full-bleed "bottom accent" red stripe.
          Always rendered — visibility is controlled entirely by CSS
          (.mobileAccent's media query in RootLayout.module.css), not by
          JS viewport detection. aria-hidden because it's purely
          decorative and carries no content a screen reader should
          announce. data-testid rather than a role-based query since
          it has no semantic role to query by. */}
      <div
        className={styles.mobileAccent}
        data-testid="mobile-bottom-accent"
        aria-hidden="true"
      />
    </div>
  );
}