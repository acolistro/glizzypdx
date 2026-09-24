// ContactPage is the content for the /contact route (GLPDX-156). Plain
// presentational component, no props/hooks -- static content, same as
// -AboutPage.tsx / -FaqPage.tsx.
//
// This is general site contact, not a second vendor-onboarding form --
// the CTA below points toward that pipeline, but the actual inquiry
// form stays a separate, dedicated page (GLPDX-157's /get-listed once
// it exists). Don't merge the two.
export function ContactPage() {
  return (
    <article>
      <h2>Contact</h2>

      <p>
        Questions, feedback, or just want to say hi? Email{" "}
        <a href="mailto:alex@mallsoft.love">alex@mallsoft.love</a>.
      </p>

      <p>
        Don't have an account? Interested in becoming a listed vendor?
        {" "}
        {/* TEMPORARY: links to "/" (the inquiry form's current
            location), not /get-listed -- same interim pattern as
            -FaqPage.tsx (GLPDX-158), for the same reason: GLPDX-157
            hasn't moved the form yet, and TanStack's <Link> both
            type-checks against the real route tree (which doesn't
            have /get-listed yet) and requires live router context
            this standalone-tested page doesn't have. MUST become
            <Link to="/get-listed"> once GLPDX-157 lands -- tracked
            on that ticket's "Follow-up required" note, which this
            page is also now listed under. */}
        <a href="/">Reach out here</a>.
      </p>
    </article>
  );
}