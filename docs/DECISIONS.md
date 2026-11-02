# Decisions

Decisions recorded here are settled. Raise a concern once, briefly, rather than reopening one.

<!-- Template:
## YYYY-MM-DD: <decision in one line>
**Context:** why it came up.
**Decision:** what we chose.
**Alternatives:** what we didn't choose, and why.
-->

## 2026-11-02: Public repo, published with GitHub Pages
**Context:** Graham asked for the existing folder to become a public repo with a live page.
**Decision:** `grahamlehr/emissions-mapper`, public, served by GitHub Pages from `main` at the repo root (`.nojekyll` so files are served as-is). No licence file, matching Graham's other public repos.
**Alternatives:** Render static site (unneeded for plain files); a `docs/` or `gh-pages` publishing folder (adds a copy step for no gain).

## 2026-11-02: Stay static, no build step
**Context:** The app is three files and runs from any static host.
**Decision:** Keep plain HTML, CSS and ES modules, with libraries from pinned CDN URLs. Revisit only if tests or a bigger airport dataset need tooling.
**Alternatives:** Vite (adds a build and a deploy action for little benefit today).

## 2026-11-02: Use the Signal design system
**Context:** Graham wants this to match his other tools.
**Decision:** Signal's tokens and `.sg-*` classes are copied into `src/styles/signal/` from `~/Documents/Signal Design System`, and changes start there. Geist loads from Google Fonts, as Signal ships it. Light theme. Map tiles are greyscaled, so colour comes only from the data, in line with Signal's black-and-white imagery rule.
**Alternatives:** Keeping the original bespoke styles; self-hosting Geist, as Baton does (worth it there because it runs mid-meeting, not here).
