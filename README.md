# Flight emissions mapper

A browser-only tool for choosing where to hold an event. Upload where your attendees are travelling from, set a travel policy, and see every candidate host city ranked by flight emissions, with jetlag shown on top.

**Live:** https://grahamlehr.github.io/emissions-mapper/

Use it to compare options and guide a planning conversation, not as a post-event carbon report.

## Using it
1. Click **Load demo** to try sample data, or upload an Excel or CSV file with the columns `location`, `country`, `people` and, optionally, `airport` (an IATA code).
2. Check **Airport assumptions**. Each group says how it was placed, for example "nearest major airport, 25 km". For any group marked "not placed" or "check", search for the right airport by city, name or code. Any of about 3,200 airports with scheduled flights can be picked.
3. Under **Host cities**, add the places you're considering, by city name or airport code; any airport works, not only the 90 built-in host cities. **Compare shortlist only** compares just those. Switch it off to rank the 90 host cities plus your shortlist, with yours tagged. The shortlist is remembered in this browser.
4. Adjust the travel policy: the flight length above which business class is assumed, the non-CO2 uplift and return or one-way trips. The emission factors can be changed under **Emission factors (advanced)**.
5. Click a city on the map to see its totals and biggest contributors (and add it to your shortlist), or switch to **Table** for a sortable ranking. From there you can **Download CSV**, **Download PNG** (an image of the map and top 10 for slides) or **Print** a report with the assumptions, the full table and the method.

Your file is read in the browser and never uploaded anywhere.

## How it's calculated
The method follows the [UK Government GHG conversion factors 2026](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026) (DESNZ), and the app's **How this is calculated** section explains each step.

- **Distance.** The great-circle distance between airports, plus 8% for indirect routes and delays.
- **Flight type.** Under 500 km counts as domestic (a cut-off chosen for this tool), under 3,700 km as short-haul, and anything longer as long-haul.
- **Cabin.** Economy, or business when the estimated flight time (distance ÷ 850 km/h + 0.55 h) is over the policy threshold.
- **Factors.** Grams of direct CO2 per passenger-km:

  | Flight type | Economy | Business |
  |---|---|---|
  | Domestic | 124.0 | 124.0 |
  | Short-haul | 68.0 | 102.0 |
  | Long-haul | 63.2 | 183.3 |

- **Non-CO2.** ×1.7 when switched on.
- **Trips.** Return journeys by default (×2).
- **Jetlag.** The person-weighted average time-zone difference, using standard time with no daylight saving.

Only CO2 is counted, so results are slightly lower than DESNZ's CO2e figures.

Airport data comes from [OurAirports](https://ourairports.com/data/) (public domain). Places, regions and time zones come from [GeoNames](https://www.geonames.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Both are bundled in `data/`, so nothing about your attendees is looked up online.

## Running locally
```bash
python3 -m http.server 8080 --bind 127.0.0.1
```
Then open http://localhost:8080. No build step and no dependencies to install. Run the tests with `node --test`.

See [docs/REVIEW.md](docs/REVIEW.md) for known issues and the improvement backlog.
