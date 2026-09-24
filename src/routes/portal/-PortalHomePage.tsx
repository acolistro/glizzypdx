// Placeholder content for /portal (GLPDX-50), shown once a vendor logs
// in. Real portal home content (live status, GLPDX-70; profile,
// check-in controls, etc.) hasn't been built yet -- this exists only
// so login has somewhere real to redirect to, per this session's
// explicit decision. Will be replaced once that work lands.
//
// KNOWN GAP: this route has no auth guard yet (GLPDX-53 not built),
// so it's reachable by anyone who navigates here directly, logged in
// or not. Tracked as a required follow-up on GLPDX-53.
export function PortalHomePage() {
  return (
    <>
      <h2>Vendor Portal</h2>
      <p>You're logged in. Your vendor portal is coming soon.</p>
    </>
  );
}