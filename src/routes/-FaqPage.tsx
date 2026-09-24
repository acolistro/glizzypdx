// FaqPage is the content for the /faq route (GLPDX-158). Plain
// presentational component, no props/hooks -- static content, same as
// -AboutPage.tsx.
//
// Uses native <details>/<summary> for each question -- built-in
// keyboard operability and expanded/collapsed state announced to
// screen readers automatically, no custom JS or ARIA needed. Standard
// pattern for FAQ pages: lets visitors scan questions without a wall
// of answer text up front.
export function FaqPage() {
  return (
    <article>
      <h2>Frequently Asked Questions</h2>

      <section>
        <h3>For Visitors</h3>

        <details>
          <summary>How does the map work?</summary>
          <p>
            Vendors show up as pins. A green pin means a vendor is
            currently checked in and active. A gray pin means a vendor
            has opted in to show their last known location after their
            check-in expired — gray pins are hidden by default; turn on
            "show inactive" to see them, along with when the vendor was
            last active.
          </p>
        </details>

        <details>
          <summary>Why can't I find a vendor I saw before?</summary>
          <p>
            Vendors control their own visibility. A vendor's pin only
            appears while they're checked in, or afterward if they've
            opted in to last-known display — there's no automatic or
            continuous tracking keeping a vendor visible by default.
          </p>
        </details>

        <details>
          <summary>Is my visit tracked?</summary>
          <p>
            No. You can browse the map without creating an account,
            and GlizzyPDX doesn't use cookies, fingerprinting, or
            analytics that follow individual visitors.
          </p>
        </details>
      </section>

      <section>
        <h3>For Vendors</h3>

        <details>
          <summary>How do I get listed?</summary>
          <p>
            Listing is invite-only — there's no public self-registration.
            {" "}
            {/* TEMPORARY: links to "/" (the inquiry form's current
                location), not /get-listed, because GLPDX-157 hasn't
                moved the form yet. Plain <a>, not TanStack's <Link>,
                since this page is tested standalone without a
                <RouterProvider> (see -AboutPage.tsx's convention) and
                <Link> requires live router context just to render.
                MUST become <Link to="/get-listed"> once GLPDX-157
                lands -- tracked there, see its "Follow-up required"
                note. */}
            <a href="/">Get in touch</a> and we'll follow up if it's a
            good fit.
          </p>
        </details>

        <details>
          <summary>How do check-ins work?</summary>
          <p>
            You manually check in when you're open for business and set
            your own expiry time. There's no automatic or continuous
            location tracking running in the background.
          </p>
        </details>

        <details>
          <summary>What does "last known" opt-in mean?</summary>
          <p>
            After your check-in expires, you can choose to keep showing
            a gray pin at your last location, clearly labeled with when
            you were last active. This is off unless you turn it on —
            it's never automatic.
          </p>
        </details>

        <details>
          <summary>How do I update or remove my listing?</summary>
          <p>
            You can edit your profile and delete your check-in history
            at any time from the vendor portal.
          </p>
        </details>
      </section>
    </article>
  );
}