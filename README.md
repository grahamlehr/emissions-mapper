# Flight emissions mapper

A browser-only tool for choosing where to hold an event. Upload where your attendees are travelling from, set a travel policy, and see every candidate host city ranked by flight emissions, with jetlag shown on top.

**Live:** https://grahamlehr.github.io/emissions-mapper/

Use it to compare options and guide a planning conversation, not as a post-event carbon report.

## Using it
1. Click **Demo** to try sample data, or upload an Excel or CSV file with the columns `location`, `country`, `people` and, optionally, `airport` (an IATA code).
2. Check **Airport assumptions** and correct any guesses marked medium or low.
3. Adjust the travel policy: the flight length above which business class is assumed, the economy emission factor, the business multiplier and the non-CO2 uplift.
4. Click a city on the map to see its totals and biggest contributors.

Your file is read in the browser and never uploaded anywhere.

## How it's calculated
- Distance is the great-circle distance between airports. Flight time is distance ÷ 850 km/h + 0.55 h.
- Emissions = distance × people × economy factor (default 0.115 kg CO2e per passenger-km) × business multiplier (2.8 when the flight is longer than the policy threshold) × non-CO2 uplift (1.9 when on).
- Figures are one-way. Jetlag is the person-weighted average time-zone difference, using fixed offsets with no daylight saving.

## Running locally
```bash
python3 -m http.server 8080 --bind 127.0.0.1
```
Then open http://localhost:8080. No build step and no dependencies to install.

See [docs/REVIEW.md](docs/REVIEW.md) for known issues and the improvement backlog.
