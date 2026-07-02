cat > .github/pull_request_template.md << 'EOF'
## Jira ticket

<!-- e.g. GLPDX-12 — if this PR covers multiple tickets, list them all -->

## Summary

<!-- What does this PR do, in a sentence or two? -->

## Changes

<!-- Bullet list of what changed -->

-
-

## Testing

- [ ] Unit/integration tests added or updated (Vitest + React Testing Library)
- [ ] E2E coverage added or updated where relevant (Playwright)
- [ ] All tests pass locally (`npm run test` and `npm run test:e2e`)
- [ ] Coverage threshold maintained

## Privacy checklist

- [ ] No automatic location capture introduced
- [ ] No new tracking, cookies, or third-party scripts added without prior discussion
- [ ] Public map remains fully anonymous (no accounts/sessions required)

## Mobile check

- [ ] Verified on a mobile viewport
- [ ] Verified in at least one privacy-focused browser (Brave/Firefox with strict tracking protection)

## Screenshots / recording (if UI changes)

<!-- Drag and drop images or a screen recording here -->

## Notes for reviewer

<!-- Anything that needs context, follow-up tickets, or known limitations -->
EOF