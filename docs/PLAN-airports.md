# Plan: robust airport data and location matching

_Drafted 2026-11-03. Covers REVIEW.md product suggestion 2 (still open: a city gazetteer and nearest-airport lookup), and widens it to "as many airports as is feasible"._

## Goal
Any reasonable "where are you coming from" entry in a planner's spreadsheet lands on the airport that person would really fly from. The tool never gives a confident wrong answer. When it isn't sure, it says so and tells the planner why.

**Success measure:** a golden test set of real-world location strings, scored on every change:
- **No confident wrong answers.** Every "matched" (high-confidence) result is correct. This is the hard rule.
- **At least 95% correct overall.** The rest are flagged "check" or "not placed", never silently wrong.
- **Fast enough.** 1,000 rows match in under 200 ms in the browser.

## Where we are
- **Airports:** 90 hand-written records in `src/model.js`, each with a code, city, country, coordinates, a standard-time offset, an optional hub flag and aliases. The same list is both every place someone can fly *from* and every candidate *host*.
- **Matching:** a whole-word city or alias match, country first. If only the country is known, it falls back to the country's hub. Anything smaller than the listed cities ("Oxford", "Leiden", "Portland, OR") gets only a country default or is unplaced.
- **The airport picker** in Airport assumptions is a `<select>`, which won't scale beyond a few hundred options.

## Baseline (PR A, 2026-11-03)
These are the results for today's matcher on the 308-case golden set (`node tools/score-matching.mjs`):

| Outcome | Cases | Share |
|---|---|---|
| Correct | 160 | 51.9% |
| Flagged (safe miss) | 145 | 47.1% |
| Overconfident (right, but should have been flagged) | 2 | 0.6% |
| Confident wrong | 1 | 0.3% |

- **Confident wrong:** "Frankfurt (Oder)" goes to FRA.
- **Overconfident:** "Birmingham" and "Santiago" with no country.
- **Most safe misses** are country defaults for places outside the 90-airport list.

## Approach

### 1. Data, built offline and committed
A Node script, `tools/build-data.mjs` (no dependencies), reads source files that are downloaded by hand into a git-ignored `data/raw/`. It writes compact JSON to `data/`, and the output is committed. The site stays plain static files. The script is run by hand, perhaps once a year, and isn't part of deploying.

| Source | Gives us | Licence |
|---|---|---|
| [OurAirports](https://ourairports.com/data/) `airports.csv`, `countries.csv`, `regions.csv` | every airport with IATA/ICAO codes, type (large/medium/small), scheduled-service flag, municipality, country and region | Public domain |
| [GeoNames](https://download.geonames.org/export/dump/) `cities15000` (or `cities5000`), `admin1CodesASCII`, `countryInfo` | places with population, alternate names, region (state/province) and IANA time zone; country names and codes | CC BY 4.0 (needs a credit on the page) |

**Airports kept:** open, with scheduled passenger service and an IATA code, of type large or medium. We expect a few thousand; phase 1 measures the real number.

**Each airport record:**
- code, name, municipality, country, region
- latitude and longitude, to 2 decimal places
- size (large or medium)
- standard-time offset

**Time zones:** take each airport's IANA time zone from the nearest GeoNames place in the same country. At build time, turn it into a standard-time offset with `Intl`: the smaller of the January and July offsets, which works in both hemispheres. Fractional offsets such as India (+5.5) and Nepal (+5.75) already work with `tzDifference`.

**Curated overrides** live in a small hand-maintained file, `data/overrides.json`:
- which airport is the hub for each country
- metro codes (LON, NYC, PAR, TYO, MIL, STO, WAS, BUE, and so on), each mapped to its main airport
- extra aliases (NYC, SF, "Bay Area", Holland, Deutschland)
- the list of default host cities

Today's 90 airports become the first version of this file.

**Size budget:** about 1 MB of JSON in total before compression, which GitHub Pages serves gzipped at about 300 KB. If GeoNames alternate names push past that, keep only Latin-script names that differ from the main name. A few non-Latin names can be added later if needed.

### 2. Loading
- `main.js` fetches `data/airports.json` and `data/places.json` from the same origin at start-up. This request carries no attendee data, so it fits the privacy invariant.
- While the files load, the upload controls show "Loading airport data…". If the fetch fails, the page explains and offers a retry.
- The model stays pure. Matching functions take the data as an argument (an index built once), so tests load the same JSON from disk.

### 3. Matching pipeline
These steps run in order. Each result carries a confidence and a plain-English reason, which the review panel shows.

1. **Airport column.** An IATA (3-letter) or ICAO (4-letter) code is used directly. *High.*
2. **Split the text.** Break "City, Region, Country" into parts. The country comes from the country column, or else from a trailing part. It can be an ISO-2 or ISO-3 code, an English or local name, or an alias. Diacritics are folded first, so São Paulo, Zürich and Kraków match.
3. **Region.** Recognise US states, Canadian provinces, Australian states and UK nations by name or abbreviation ("Portland, OR", "London, ON", "Perth, WA", "Sydney NSW").
4. **Place lookup.** Look the name up in GeoNames and in airport municipalities (name, ASCII name and alternate names), within the country and region when known.
   - *High* if there's one candidate, the region decides it, or one candidate is at least 10 times larger than the next.
   - *Check* otherwise: "3 places called Springfield in the United States: picked the largest."
5. **Metro and alias overrides.** NYC, "Bay Area", "Greater London", Manhattan and the like.
6. **Typos.** As a last resort before the country default, allow an edit distance of 1 (2 for names of 9 or more characters) within the known country. *Check:* "possible typo for Edinburgh".
7. **Country only.** Use the country's hub. *Check*, as today.
8. **Otherwise unplaced**, as today. There's never a fallback city.

**From a place to an airport:** people usually drive past a small regional airport to reach a hub, so:
- Use the nearest **large** airport within 150 km, in any country (this covers Geneva and Basel–Mulhouse).
- If there isn't one, use the nearest medium airport within 100 km.
- If there isn't one, use the nearest large airport in the same country, marked *check* with the distance ("nearest major airport is 340 km away").

The review panel shows how each match was made, for example "Leiden → AMS (Amsterdam Schiphol, 31 km)". Planners can still override any group.

### 4. Hosts
- The default ranking stays a curated list of major event cities, in `overrides.json` and grown from 90 to about 150. Ranking thousands of airports would bury the useful answers and clutter the map.
- The shortlist accepts **any** airport in the full list, so a planner can compare, say, Bilbao against Porto.

### 5. UI
- **Airport picker:** the review panel's `<select>` becomes a searchable text field with suggestions, like the shortlist input, covering the full airport list.
- **Match reasons:** each group shows its match reason and distance.
- **Credits:** the How this is calculated section and the footer credit GeoNames (CC BY) and OurAirports.

## Delivery: four PRs, each usable on its own
| PR | Contents | Done when |
|---|---|---|
| A. Golden set | `tests/fixtures/locations.json` with about 300 cases and expected airports, covering the tricky ones (Portland OR/ME, London ON, Paris TX, Birmingham UK/AL, Cambridge MA, San José CR/CA, Georgia the country and the US state, Jerome, Washington DC, Frankfurt am Main, NYC, Bay Area, diacritics, typos, "Remote", blanks, plus non-English spellings such as München, Lisboa, Den Haag). Also a scoring script that prints accuracy. | The baseline accuracy of today's matcher is recorded in this plan. No behaviour change. |
| B. Data | The build script, the generated `data/*.json`, `overrides.json` seeded from today's 90, the loader, and the model taking data as an argument. Matching behaves exactly as today. | Existing tests pass on the new data; the size budget is met; the airport count is known. |
| C. Matcher | The pipeline above, with unit tests for each step and a performance test. | The golden set has no confident wrong answers and is at least 95% correct; 1,000 rows take under 200 ms. |
| D. UI and docs | The searchable airport picker, match reasons, the shortlist across all airports, the credits, and updates to AGENTS.md, README and DECISIONS. | Checked in the browser at desktop width and 375 px; docs updated. |

The plan, and the scoring rules for C, are written by Opus. The build script, the loader and the UI are implemented by Sonnet subagents. I verify the result each time.

## Decisions (agreed with Graham on 2026-11-03: all seven recommendations)
1. **Data sources.** Options: OurAirports + GeoNames, or OpenFlights (whose data is frozen since 2017 and under ODbL share-alike). *Recommend OurAirports + GeoNames.*
2. **Which airports.** Options: large and medium airports with scheduled service, or small ones too. *Recommend large and medium.* The nearest-airport rule prefers large ones anyway, and small airfields add noise.
3. **Gazetteer size.** Options: GeoNames `cities15000` (about 26,000 places), `cities5000` (about 50,000) or `cities1000` (about 140,000). *Recommend starting with `cities15000` plus airport towns*, then stepping up to `cities5000` if the golden set shows misses.
4. **Hosts.** Options: a curated default list of about 150 plus a shortlist from any airport, or every large airport as a host. *Recommend curated plus shortlist.*
5. **Data script.** Options: generate the data with a Node script and commit it, or keep hand-editing `model.js`. *Recommend the script*, recorded as a new DECISIONS.md entry.
6. **Nearest-airport rule.** Options: prefer a large hub within 150 km over a closer regional airport, or always take the nearest airport. *Recommend preferring the hub*, with planner override as today.
7. **Loading.** Options: fetch the JSON from the same origin at start-up (about 300 KB gzipped), or inline it in a JS module. *Recommend fetching*, because the file stays readable and the code stays small.

## Risks
- **GeoNames attribution is required** (CC BY). It's a one-line credit, but it must be there.
- **Size.** If the gazetteer blows the budget, use a smaller GeoNames file and rely on airport municipality names. Measure in PR B.
- **Ambiguity can't be fully solved.** "Springfield, USA" is a guess by design. The goal is to flag it, not to be clever.
- **"No build step" changes slightly.** A data script is new tooling. DECISIONS.md already says "Revisit only if… a bigger airport dataset need[s] tooling", so this is the expected revisit. It needs a new entry, not a reversal.
