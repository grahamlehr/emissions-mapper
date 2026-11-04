# Handoff
_Updated 2026-11-03 · branch `feat/airport-picker` (stacked: PR 12 `feat/airport-golden-set` → `feat/airport-data` → `feat/airport-matcher` → `feat/airport-picker`) · B, C and D not pushed yet (public repo, needs Graham's OK)_

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
- DESNZ 2026 factors and a "How this is calculated" section (product suggestion 4), merged in PR 7 and live.
- CSV download and print view (product suggestion 7, partly), merged in PR 8 and live.
- PNG export, drawn with the Canvas API (no new library), merged in PR 9 and live. Verified locally in Chrome from Map and Table view: 3200×2000 and untainted. Not checked in Safari.
- Share-by-link dropped (recorded in `docs/DECISIONS.md`), merged in PR 10. Suggestion 7 is complete.
- Host-city shortlist (product suggestion 6), merged in PR 11 and live. Verified locally in Chrome at desktop and 375 px: adding, removing, filtering, fit-to-shortlist, localStorage, table tags and the PNG. Not checked in Safari.

## Next
- Airport data and matching overhaul (`docs/PLAN-airports.md`). The decisions are agreed and recorded in DECISIONS.md. PR A (golden set and scorer, baseline 51.9%) is PR 12. PR B (data script, generated data, overrides and loader, with matching unchanged) is committed on `feat/airport-data`. PR C (the new matcher: 99.6% on 465 cases, no confident wrong) is committed on `feat/airport-matcher`. PR D (searchable picker and shortlist from any airport) is committed on `feat/airport-picker`. Next: push B, C and D with Graham's OK, and merge them in order after PR 12. The source files are in `data/raw/`, which is git-ignored.
- Product backlog in `docs/REVIEW.md`. Suggested order: 5 (rail for short hops), 8 (column mapping), then the gazetteer from 2, which would also let shortlists include cities outside the built-in list.
- Refresh the factors when DESNZ publishes its 2027 set, around June 2027.

## Open decisions (need Graham)
- Which product suggestions to build next, and in what order.

## Decided: don't relitigate
See `docs/DECISIONS.md`.

## Gotchas
- Public repo: every push publishes. Ask before pushing, opening PRs or merging.
- ES modules need the local server. `file://` won't work.

## State
`main` is live on GitHub Pages, including PRs 4 to 11.

## Prompt for the next session
Read AGENTS.md, docs/DECISIONS.md and docs/REVIEW.md first, in /Users/graham/Projects/EmissionsMapper. Then build the next product suggestions from REVIEW.md.
