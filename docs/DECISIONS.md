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

## 2026-11-02: Emission factors follow DESNZ 2026
**Context:** The app used one flat factor (0.115 kg per passenger-km), a ×2.8 business multiplier and a ×1.9 non-CO2 uplift, with no cited source (REVIEW.md suggestion 4).
**Decision:** Use the UK Government GHG conversion factors 2026 (DESNZ, published 11 June 2026), from methodology paper tables 36–37:
- direct CO2 per passenger-km of 124.0 g for domestic, 68.0 g / 102.0 g for short-haul economy / business, and 63.2 g / 183.3 g for long-haul economy / business
- +8% on great-circle distance (paragraph 8.37)
- a ×1.7 non-CO2 multiplier (paragraph 8.42)

Flights are classed by distance, because DESNZ's region rule only works for flights to and from the UK: under 500 km is domestic (our cut-off), and under 3,700 km is short-haul. Only CO2 is counted, without methane and nitrous oxide. With the demo data, totals fall by about 45% and the ranking order holds.
**Alternatives:**
- ICAO's carbon calculator: not assessed in detail. DESNZ was chosen because it publishes per-class factors and a method paper we can cite.
- DESNZ's published CO2e "with RF" factors: these apply 1.7 only to the CO2 share, which is harder to explain, and the gain is small.
- Keeping the old flat factor: no source, and its non-CO2 multiplier is out of date.

Revisit when DESNZ publishes the 2027 set.

