# Flight emissions mapper

<!-- Keep this file under ~200 lines. It holds rules, not status or history: those go in docs/ (see Doc map).
     CLAUDE.md is a one-line stub (@AGENTS.md) so Claude and Codex read the same rules. -->

## What this is
A browser-only tool for event planners. Upload a spreadsheet of where attendees are coming from, set a travel policy (business class over N hours, emission factors, non-CO2 uplift), and every candidate host city is ranked by total flight emissions, with jetlag on top. It's for comparing options in a planning conversation, not for post-event carbon reporting. "Good" means a non-technical planner gets a believable ranking from their own spreadsheet in under a minute, and can see and fix every location guess the tool made.

## Stack
- Static HTML, CSS and vanilla ES modules. No build step, no package manager. `package.json` exists only to mark the repo as ESM for `node --test`. It has no dependencies.
- `src/model.js` holds the airports, matching, parsing and scoring as pure functions, with no DOM access. `src/labels.js` and `src/layout.js` hold pure geometry for map labels and the PNG layout. `src/snapshot.js` draws the PNG export on a canvas. `src/main.js` holds only the DOM and map code.
- Leaflet 1.9.4 (unpkg, SRI-pinned) with OpenStreetMap tiles, loaded with `crossOrigin: "anonymous"` so the PNG export can draw them; SheetJS for Excel parsing (CDN).
- Styling: Graham's **Signal** design system. Tokens and the `.sg-*` class layer are copied into `src/styles/signal/` from `~/Documents/Signal Design System`; change them there first, then copy them across.
- Hosted on GitHub Pages from `main`, repo root.

## Commands
| Task | Command |
|---|---|
| Install | None |
| Dev | `python3 -m http.server 8080 --bind 127.0.0.1` (or the `static` entry in `.claude/launch.json`) |
| Test | `node --test` (runs `tests/*.test.mjs` against the pure modules `src/model.js`, `src/labels.js` and `src/layout.js`) |
| Lint | `for f in src/*.js; do node --check "$f"; done` (syntax only) |
| Deploy | Merge to `main`. GitHub Pages publishes within a minute or two |

ES modules don't load from `file://`, so always use the local server.

## Environments
| Env | URL / host | How to reach it | Notes |
|---|---|---|---|
| Local | `http://localhost:8080` | Dev command above | |
| Prod | `https://grahamlehr.github.io/emissions-mapper/` | Merge to `main` | **Public repo and public site**: every push publishes. Pushes, PRs and merges need Graham's explicit OK |

## Invariants
- Attendee data never leaves the browser. No analytics, no backend, no requests that carry uploaded content. The only network calls are the CDN libraries, fonts and map tiles.
- Works as plain static files on GitHub Pages: relative paths only, no build output.
- Every third-party script or stylesheet is version-pinned, with an `integrity` hash where the CDN supports it.
- No secrets exist in this repo. Keep it that way.
- The only browser storage is the host-city shortlist (airport codes and one switch) in `localStorage`, key `emissionsMapper.shortlist`. Never store attendee data.

## External APIs
| API | Cost / limits | In tests |
|---|---|---|
| OpenStreetMap tile servers | Free, but under OSMF's tile usage policy (light use, attribution required) | Not called from tests |

## Doc map
- `docs/REVIEW.md`: code review and the improvement backlog
- `docs/DECISIONS.md`: decisions already made. Don't relitigate them.
- `docs/HANDOFF.md`: current state and the prompt for the next session (`/handoff`)

## Definition of done
1. `node --test` and the lint command pass.
2. Docs touched by the change are updated in the same PR, including this file when commands, environments or conventions change.
3. The PR says where it was verified: local or prod (the Pages URL).
4. Use `/ship` to commit and open the PR, and `/tidy` to clean up afterwards.
