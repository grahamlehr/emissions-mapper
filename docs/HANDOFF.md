# Handoff
_Updated 2026-11-02 · branch `feat/method-note` · PR not opened yet (public repo, needs Graham's OK)_

## Goal
Publish the emissions mapper as a public GitHub Pages site, review it, restyle it in Signal, and fix the review's findings.

## Done
- Repo scaffolded from the repo kit. The code review is in `docs/REVIEW.md`.
- Signal restyle merged to `main` (PR 1).
- Review bugs and housekeeping fixed on `claude/emissions-mapper-review-7e779c`:
  - the model is split into `src/model.js`, with `node --test` tests
  - whole-word, country-first matching with 90 airports and no London fallback
  - an unplaced-groups banner, with those groups left out of totals
  - return trips by default
  - CSV parsing that handles semicolons, quoted newlines and thousands separators
  - SheetJS 0.20.3 with SRI
  - focus kept on airport selects
  - duplicate handlers removed
  - a Heat toggle

  Merged in PR 4.
- Ranked comparison table (product suggestion 3), merged in PR 5 and live.
- Pan to selection and label collisions (product suggestion 10), merged in PR 6 and live.
- DESNZ 2026 factors and a "How this is calculated" section (product suggestion 4) on `feat/method-note`. Verified locally at 1280px. The subagent also checked 375px and the factor editing.

## Next
- Push `feat/method-note` and open its PR (needs Graham's OK: public repo).
- Product backlog in `docs/REVIEW.md`. Suggested order: 7 (export the table as CSV), 6 (your own candidate cities), 5 (rail for short hops).
- Refresh the factors when DESNZ publishes its 2027 set, around June 2027.

## Open decisions (need Graham)
- Which product suggestions to build next, and in what order.

## Decided: don't relitigate
See `docs/DECISIONS.md`.

## Gotchas
- Public repo: every push publishes. Ask before pushing, opening PRs or merging.
- ES modules need the local server. `file://` won't work.

## State
`main` is live on GitHub Pages, including PRs 4 to 6. `feat/method-note` is local only.

## Prompt for the next session
Read AGENTS.md, docs/DECISIONS.md and docs/REVIEW.md first, in /Users/graham/Projects/EmissionsMapper. Then build the next product suggestions from REVIEW.md.
