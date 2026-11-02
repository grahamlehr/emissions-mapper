# Handoff
_Updated 2026-11-02 · branch `signal-design` · PR none yet_

## Goal
Publish the emissions mapper as a public GitHub Pages site, review it, and restyle it in Signal.

## Done
- Repo scaffolded from the repo kit; code review written to `docs/REVIEW.md`.
- Signal restyle on branch `signal-design`, verified locally at desktop and 375px. It also fixes the Leaflet CSS SRI hash, the tooltip overflow, `role="img"` on the map and `aria-pressed` on the layer toggles.

## Next
- Push `main`, create the public repo, enable Pages; push `signal-design` and open its PR (needs Graham's OK: public repo).
- Pick which items from `docs/REVIEW.md` to build next.

## Open decisions (need Graham)
- Which review suggestions to build, and in what order.

## Decided: don't relitigate
See `docs/DECISIONS.md`.

## Gotchas
- Public repo: every push publishes. Ask before pushing, opening PRs or merging.
- ES modules need the local server; `file://` won't work.

## State
Local only until the first push. Nothing is on GitHub yet.

## Prompt for the next session
Read AGENTS.md, docs/DECISIONS.md and docs/REVIEW.md first, in /Users/graham/Projects/EmissionsMapper.
