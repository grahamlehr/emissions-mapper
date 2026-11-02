# Code review: Flight emissions mapper

_Reviewed 2026-11-02 against the original code (`index.html`, `src/main.js`, `src/styles.css`). Line numbers refer to that version._

## Summary
It's a tidy, dependency-light static app: one HTML page, about 690 lines of vanilla JS and Leaflet. The core idea works. Upload attendee locations, then see every candidate host city ranked by flight emissions, with jetlag shown on top. The code is readable and escapes user input properly.

The main problems are in the inputs, not the maths. Location matching is fragile and fails silently, so a bad upload can quietly put a large share of attendees in London or Rome. A stylesheet integrity error and some accessibility gaps also need fixing before this is a public tool.

Each finding was checked by running the app in a browser or calling the functions directly.

## Bugs, most severe first

| # | Severity | Where | Problem | Evidence |
|---|---|---|---|---|
| 1 | High | `src/main.js:162-166` | City matching uses a substring test on "location + country", so short city names match inside other words. The result is marked **high** confidence. | `Jerome, United States` maps to Rome (FCO), high confidence. |
| 2 | High | `src/main.js:174` | Any location it can't place silently falls back to **London**. The rows are counted in every total, marked only "low" in a list the user may never scroll to. | `Warsaw, Poland`, `Lisbon, Portugal` and `Seattle, U.S.` all become LHR. |
| 3 | High | `index.html:10` | The Leaflet CSS `integrity` hash is wrong, so the browser **blocks the stylesheet**. That's why `styles.css:411` onwards re-implements part of Leaflet by hand, and why the zoom control and attribution look broken. | Console: "Failed to find a valid digest… The resource has been blocked." The correct hash is `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`. |
| 4 | Medium | `src/main.js:222-225` | Emissions are **one-way**. Every total and per-person figure is about half the real return-trip footprint. Relative rankings are unaffected, but the absolute numbers are what people quote. | LHR to JFK comes out at 3.4 t per person, one way, business with uplift. |
| 5 | Medium | `src/main.js:168` | "Country default" picks the first airport for that country in the list. Every US attendee without a matched city flies from Atlanta, and every Chinese one from Shanghai. | `San Francisco, USA` becomes ATL, medium confidence. |
| 6 | Medium | `src/main.js:47,50` | The `u.s.` and `u.k.` aliases can never match, because `normalize()` strips the dots first. | `Leeds, U.K.` falls back to London, low confidence. |
| 7 | Medium | `src/main.js:180` | `Number("1,200")` is `NaN`, so CSV rows with thousands separators are **dropped silently**. The message says "loaded N groups" with no count of skipped rows. | |
| 8 | Medium | `index.html:130` | The map has `role="img"`, which makes everything inside it presentational. Screen readers can't reach the keyboard-focusable airport markers. | |
| 9 | Medium | `src/main.js:329-351` | Changing an airport `<select>` rebuilds the whole review list, so keyboard focus is lost after each change. The same rebuild runs on every slider tick. | |
| 10 | Low | `src/styles.css:168` | `.tooltip` sets `white-space: nowrap` and the bubble inherits it, so the non-CO2 explanation runs off-screen on one line. | Bubble content is 830px wide in a 318px box. |
| 11 | Low | `src/main.js:496,503` | Marker clicks are handled twice, once by Leaflet and once by a DOM listener, so each click re-renders the map twice. | |
| 12 | Low | `src/main.js:669-672` | Inputs listen to both `input` and `change`, so every committed change recalculates twice. | |
| 13 | Low | `index.html:20` | SheetJS 0.18.5 has known advisories (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). It's also the last version on npm and is loaded without SRI. The risk is low because users only open their own files, but a public tool should use the current release from `cdn.sheetjs.com` with an integrity hash. | |
| 14 | Low | `src/main.js:564` | CSV delimiter detection only knows commas and tabs. Excel in many European locales exports semicolon-separated CSV. Quoted fields with line breaks also split wrongly. | |
| 15 | Low | `src/styles.css:35,45,341` | `100vh` overflows behind mobile browser toolbars. Use `100dvh`. | |

Housekeeping: `state.layers.heat` has no toggle, `group.id` is unused, the page is `lang="en"` rather than `en-GB`, and the intro copy says "on your local browser" and "post event".

## Product suggestions, highest value first

1. **Make unmatched locations impossible to miss.** Show a banner such as "4 of 23 groups couldn't be placed (61 people)". List those groups first in the review panel, and leave them out of totals until someone assigns an airport. This fixes bugs 1, 2 and 5 from the user's side.
2. **Better location matching.** Match whole words, not substrings. Check the country before the city, so "London, Canada" doesn't become Heathrow. Add a much bigger airport list: the top ~300 airports by passengers fit in about 25 KB. Pick the *nearest* big airport to a geocoded city rather than the first one in the country. A bundled city list (GeoNames cities15000, trimmed) keeps it offline and private.
3. **A ranked comparison table.** At the moment you have to click cities one by one. Add a sortable table of the top 10 candidates with columns for total t CO2e, per person, average flight time, jetlag and % in business class. That's the artefact people will actually take into a planning conversation.
4. **Return trips and a clear method note.** Default to return journeys, with a one-way toggle. Add a short "How this is calculated" panel citing the factor source (for example the UK government's DESNZ/DEFRA conversion factors) and its date. Include the great-circle uplift DEFRA applies (+8%) and short-haul vs long-haul economy factors instead of one flat number.
5. **Rail for short hops.** Under a threshold (say 700 km or 4 h), assume rail at about 0.035 kg/pkm. Otherwise Brussels to Amsterdam is counted as a flight and Europe looks worse than it is.
6. **Add your own candidate cities.** Today only the 40 built-in airports can be hosts. Planners usually have a shortlist of 3 to 5 venues. Let them pin those and compare only them.
7. **Export and share.** Download the comparison as CSV, and as a PNG or print view of the map and table. Optionally encode the scenario (groups and policy, no names) in the URL hash so a link reproduces it without a server.
8. **A column-mapping step after upload.** Show the detected headers and let the user pick which one is "people" and which is "location". This replaces guessing from a fixed list of names, so "Number of attendees" or "Home office" just work.
9. **Jetlag that reflects the worst case.** The person-weighted average hides a group facing a 10-hour shift. Show "% of attendees with ≥ 6 h shift" per destination. Fix the "Severe jetlag area" metric, which counts *airports*, not people, and is hard to read.
10. **Template download.** Add a "Download template" link with the right column names next to the upload box.

## Technical suggestions

- **Split the model from the DOM.** Move the airports, matching, scoring and parsing into `src/model.js` with no `document` access. Then `node --test` can cover the cases above with no build step. Today there are no tests at all.
- **Render more efficiently.** Keep the markers and update their classes and colours instead of clearing and recreating every layer on each slider tick. Debounce the number inputs.
- **Use a basemap that suits the data.** Standard OpenStreetMap tiles are busy under coloured data and are meant for light use only. Grayscaled tiles, or a light basemap with attribution, make the emissions colours read clearly.
- **Self-host or pin with SRI** for every third-party script and stylesheet, and add a `<noscript>` message.
- **Public-page basics:** a meta description, Open Graph tags, a favicon and a short README with a screenshot and the method note.
