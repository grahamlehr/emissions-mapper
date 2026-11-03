// The model: airports, location matching, parsing and scoring. Pure functions only, with no
// access to `document` or `window`, so `node --test` can exercise it directly.

// The airport data is not hard-coded here: `installDataset` takes the parsed contents of
// data/airports.json and data/overrides.json (built by tools/build-data.mjs) and builds the
// indexes below. Call it once at start-up, before anything else in this module.
//
// AIRPORTS is the list of candidate host cities, one record per city: { code, city, country, lat,
// lon, tz, hub, aliases }. `hub: true` marks the main international gateway for a country with
// several airports; it is used when we only know the country. `aliases` are alternative city
// names (plain ASCII; they are normalised before matching). It is a live binding, replaced when
// the dataset is installed.
export let AIRPORTS = [];

// Keys are normalised (lower case, punctuation turned into single spaces), because lookups
// happen after normalize(): "U.S." arrives as "u s". Values are host country names.
export let COUNTRY_ALIASES = new Map();

let ALL_AIRPORTS = [];
let AIRPORTS_BY_CODE = new Map();
let METRO_CODES = new Map();
let KNOWN_COUNTRIES = new Set();
let COUNTRY_TERMS = [];
let CITY_NAMES = [];

// Turns a { fields, rows } table into an array of objects.
function tableObjects(table) {
  return table.rows.map((row) => Object.fromEntries(table.fields.map((field, index) => [field, row[index]])));
}

export function installDataset({ airports, overrides }) {
  const countryNameByIso = new Map(tableObjects(airports.countries).map((c) => [c.iso2, c.name]));
  const countryNames = overrides.countryNames || {};
  const countryName = (iso) => countryNames[iso] || countryNameByIso.get(iso) || iso;

  ALL_AIRPORTS = tableObjects(airports.airports).map((a) => ({
    code: a.iata,
    city: a.municipality || a.name,
    icao: a.icao,
    name: a.name,
    municipality: a.municipality,
    countryCode: a.country,
    region: a.region,
    country: countryName(a.country),
    lat: a.lat,
    lon: a.lon,
    size: a.size,
    tz: a.tz
  }));
  const fullList = new Map(ALL_AIRPORTS.map((airport) => [airport.code, airport]));

  // A host is its airport record with the curated display name, hub flag and aliases on top. The
  // full list uses the host record where there is one, so airportByCode gives the same object
  // everywhere.
  AIRPORTS = overrides.hosts.map((host) => {
    const airport = fullList.get(host.code);
    if (!airport) throw new Error(`Host airport ${host.code} is not in the airport data`);
    const record = { ...airport, city: host.city };
    if (host.hub) record.hub = true;
    if (host.aliases) record.aliases = [...host.aliases];
    fullList.set(host.code, record);
    return record;
  });
  ALL_AIRPORTS = ALL_AIRPORTS.map((airport) => fullList.get(airport.code));
  AIRPORTS_BY_CODE = fullList;

  COUNTRY_ALIASES = new Map(Object.entries(overrides.countryAliases || {}));
  METRO_CODES = new Map(Object.entries(overrides.metro || {}).filter(([, code]) => AIRPORTS_BY_CODE.has(code)));

  KNOWN_COUNTRIES = new Set(AIRPORTS.map((airport) => airport.country));

  // Every phrase that names a country, normalised, for spotting a country inside a location.
  COUNTRY_TERMS = [
    ...[...KNOWN_COUNTRIES].map((country) => ({ term: normalize(country), country })),
    ...[...COUNTRY_ALIASES].map(([term, country]) => ({ term, country }))
  ].filter((entry) => KNOWN_COUNTRIES.has(entry.country));

  // Every phrase that names a city, normalised.
  CITY_NAMES = AIRPORTS.flatMap((airport) =>
    [airport.city, ...(airport.aliases || [])].map((name) => ({ airport, name: normalize(name) }))
  );
}

// Every airport in the dataset (large and medium, with scheduled service), not just the hosts.
export function allAirports() {
  return ALL_AIRPORTS;
}

// Metro codes (LON, NYC...) mapped to the airport code that stands for the area.
export function metroCodes() {
  return METRO_CODES;
}

export const SAMPLE_ROWS = [
  { location: "London", country: "United Kingdom", people: 42 },
  { location: "New York", country: "United States", people: 18 },
  { location: "Singapore", country: "Singapore", people: 9 },
  { location: "Delhi", country: "India", people: 14 },
  { location: "Sydney", country: "Australia", people: 7 },
  { location: "Sao Paulo", country: "Brazil", people: 11 }
];

// UK Government (DESNZ) conversion factors. Direct CO2 only, in kg per passenger-km, before the
// distance and non-CO2 uplifts. The 500 km domestic cut-off is our own assumption (DESNZ's average
// UK domestic flight is 434 km); the 3,700 km short-haul limit is DESNZ's earlier, simpler rule.
export const DESNZ_2026 = {
  source: "UK Government GHG conversion factors 2026 (DESNZ)",
  url: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026",
  published: "11 June 2026",
  factorsKgPerPkm: {
    domestic: 0.124,
    shortHaul: { economy: 0.068, business: 0.102 },
    longHaul: { economy: 0.0632, business: 0.1833 }
  },
  distanceUplift: 1.08,
  nonCo2Multiplier: 1.7,
  domesticMaxKm: 500,
  shortHaulMaxKm: 3700
};

export const DEFAULT_POLICY = {
  threshold: 6,
  factors: {
    domestic: DESNZ_2026.factorsKgPerPkm.domestic,
    shortHaul: { ...DESNZ_2026.factorsKgPerPkm.shortHaul },
    longHaul: { ...DESNZ_2026.factorsKgPerPkm.longHaul }
  },
  distanceUplift: DESNZ_2026.distanceUplift,
  nonCo2Multiplier: DESNZ_2026.nonCo2Multiplier,
  returnTrip: true
};

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function canonicalCountry(value) {
  const key = normalize(value);
  if (!key) return "";
  return COUNTRY_ALIASES.get(key) || titleCase(key);
}

// Looks up any airport in the full list, not just the host cities.
export function airportByCode(code) {
  return AIRPORTS_BY_CODE.get(code) || null;
}

// Looks up a host city only. Matching and scoring use this, so they behave as they did when the
// host list was the whole airport list.
export function hostByCode(code) {
  return AIRPORTS.find((airport) => airport.code === code) || null;
}

function containsWords(normalised, phrase) {
  return Boolean(phrase) && ` ${normalised} `.includes(` ${phrase} `);
}

function countryInText(normalisedLocation) {
  let best = null;
  for (const entry of COUNTRY_TERMS) {
    if (containsWords(normalisedLocation, entry.term) && (!best || entry.term.length > best.term.length)) {
      best = entry;
    }
  }
  return best ? best.country : "";
}

function countryDefault(country) {
  const inCountry = AIRPORTS.filter((airport) => airport.country === country);
  return inCountry.find((airport) => airport.hub) || inCountry[0] || null;
}

// Returns { airport, confidence, reason }. `airport` is null (confidence "unplaced") when nothing
// sensible matches: we never guess a fallback city.
export function guessAirport(row) {
  const explicit = String(row.airport || row.iata || "").trim().toUpperCase();
  if (explicit) {
    const match = hostByCode(explicit);
    if (match) return { airport: match, confidence: "high", reason: "airport code" };
  }

  const location = normalize(row.location || row.city || row.place || "");
  let country = canonicalCountry(row.country || "");
  if (!country) country = countryInText(location);
  const countryKnown = KNOWN_COUNTRIES.has(country);

  let best = null;
  for (const entry of CITY_NAMES) {
    if (countryKnown && entry.airport.country !== country) continue;
    if (!containsWords(location, entry.name)) continue;
    if (!best || entry.name.length > best.name.length) best = entry;
  }
  if (best) return { airport: best.airport, confidence: "high", reason: "city match" };

  if (countryKnown) {
    return { airport: countryDefault(country), confidence: "medium", reason: "country default — check" };
  }

  // The location column itself may just be a country name.
  const ownCountry = canonicalCountry(location);
  if (KNOWN_COUNTRIES.has(ownCountry)) {
    return { airport: countryDefault(ownCountry), confidence: "medium", reason: "country default — check" };
  }

  return { airport: null, confidence: "unplaced", reason: "no match" };
}

// Accepts numbers, or strings with thousands separators ("1,200", "1 200", "1'200").
// Dots are never stripped. Returns NaN when the value isn't a plain number.
export function parsePeople(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const cleaned = value.replace(/[,\s '’]/g, "");
  // "1.200" is a European thousands separator. People are whole numbers, so "1.5" is invalid.
  const whole = /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, "") : cleaned;
  if (!/^\d+$/.test(whole)) return NaN;
  return Number(whole);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

// Returns { groups, skipped }. `skipped` counts rows that have content but no valid people count;
// completely blank rows are ignored without being counted.
export function buildGroups(rows) {
  const groups = [];
  let skipped = 0;
  for (const row of rows) {
    const rawPeople = [row.people, row.attendees, row.count, row.number].find((value) => !isBlank(value));
    const hasContent = [row.location, row.city, row.place, row.country, row.airport, row.iata, rawPeople].some(
      (value) => !isBlank(value)
    );
    if (!hasContent) continue;

    const people = parsePeople(rawPeople);
    if (!Number.isFinite(people) || people <= 0) {
      skipped += 1;
      continue;
    }
    const guess = guessAirport(row);
    groups.push({
      inputLocation: row.location || row.city || row.place || row.country || row.airport || "Unknown",
      country: canonicalCountry(row.country || ""),
      people,
      airportCode: guess.airport ? guess.airport.code : null,
      confidence: guess.confidence,
      reason: guess.reason
    });
  }
  return { groups, skipped };
}

export function haversineKm(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function flightHours(distanceKm) {
  return distanceKm / 850 + 0.55;
}

export function tzDifference(a, b) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 24 - raw);
}

// Which DESNZ flight type a great-circle distance falls into.
export function haulFor(distanceKm) {
  if (distanceKm < DESNZ_2026.domesticMaxKm) return "domestic";
  if (distanceKm < DESNZ_2026.shortHaulMaxKm) return "shortHaul";
  return "longHaul";
}

// Emissions for one group's travel, from the great-circle distance. Business class applies when the
// estimated flight time is over the policy threshold (domestic flights have a single factor).
// Return trips (the default) double the one-way figure.
export function emissionsForLeg(distanceKm, hours, people, policy) {
  const haul = haulFor(distanceKm);
  const cabin = hours > policy.threshold ? "business" : "economy";
  const factor = haul === "domestic" ? policy.factors.domestic : policy.factors[haul][cabin];
  const trips = policy.returnTrip === false ? 1 : 2;
  return distanceKm * policy.distanceUplift * people * factor * policy.nonCo2Multiplier * trips;
}

// A time-zone shift of at least this many hours counts as severe jetlag.
export const SEVERE_JETLAG_HOURS = 6;

// Groups without an airport are left out of every total.
export function scoreDestination(destination, groups, policy) {
  let totalEmissionsKg = 0;
  let totalPeople = 0;
  let weightedHours = 0;
  let weightedJetlag = 0;
  let businessClassPeople = 0;
  let severeJetlagPeople = 0;
  const drivers = [];

  for (const group of groups) {
    const origin = group.airportCode ? airportByCode(group.airportCode) : null;
    if (!origin) continue;
    const distanceKm = haversineKm(origin, destination);
    const hours = flightHours(distanceKm);
    const emissionsKg = emissionsForLeg(distanceKm, hours, group.people, policy);
    const jetlag = tzDifference(origin.tz, destination.tz);
    totalEmissionsKg += emissionsKg;
    totalPeople += group.people;
    weightedHours += hours * group.people;
    weightedJetlag += jetlag * group.people;
    if (hours > policy.threshold) businessClassPeople += group.people;
    if (jetlag >= SEVERE_JETLAG_HOURS) severeJetlagPeople += group.people;
    drivers.push({ origin, people: group.people, emissionsKg, hours, jetlag });
  }

  drivers.sort((a, b) => b.emissionsKg - a.emissionsKg);
  return {
    destination,
    totalEmissionsKg,
    totalPeople,
    averageEmissionsKg: totalPeople ? totalEmissionsKg / totalPeople : 0,
    averageHours: totalPeople ? weightedHours / totalPeople : 0,
    jetlagScore: totalPeople ? weightedJetlag / totalPeople : 0,
    businessClassPeople,
    businessShare: totalPeople ? businessClassPeople / totalPeople : 0,
    severeJetlagShare: totalPeople ? severeJetlagPeople / totalPeople : 0,
    drivers
  };
}

// Finds one airport from what a person typed: an IATA code, or a city name or alias that
// guessAirport is confident about. A country on its own is too vague, so it returns null.
export function findAirport(query) {
  const text = String(query ?? "").trim();
  if (!text) return null;
  const byCode = hostByCode(text.toUpperCase());
  if (byCode) return byCode;
  const guess = guessAirport({ location: text });
  return guess.airport && guess.confidence === "high" ? guess.airport : null;
}

// Every candidate city, lowest total emissions first. With `codes` (an array or Set of airport
// codes) that is not empty, only those airports are scored.
export function scoreAll(groups, policy, codes) {
  const wanted = codes ? new Set(codes) : null;
  const candidates = wanted && wanted.size ? AIRPORTS.filter((airport) => wanted.has(airport.code)) : AIRPORTS;
  return candidates.map((airport) => scoreDestination(airport, groups, policy)).sort(
    (a, b) => a.totalEmissionsKg - b.totalEmissionsKg
  );
}

const SORT_VALUES = {
  total: (score) => score.totalEmissionsKg,
  perPerson: (score) => score.averageEmissionsKg,
  hours: (score) => score.averageHours,
  jetlag: (score) => score.jetlagScore,
  severeJetlag: (score) => score.severeJetlagShare,
  business: (score) => score.businessShare
};

// Returns a new, sorted array. Keys: total, perPerson, hours, jetlag, severeJetlag, business, city.
// Ties are broken by total emissions (lowest first), then city name, whatever the direction.
export function sortScores(scores, key, direction = "asc") {
  const sign = direction === "desc" ? -1 : 1;
  const byCity = (a, b) => a.destination.city.localeCompare(b.destination.city);
  const primary = key === "city" ? byCity : (a, b) => SORT_VALUES[key](a) - SORT_VALUES[key](b);
  if (key !== "city" && !SORT_VALUES[key]) throw new Error(`Unknown sort key: ${key}`);
  return [...scores].sort(
    (a, b) => sign * primary(a, b) || a.totalEmissionsKg - b.totalEmissionsKg || byCity(a, b)
  );
}

export const CSV_HEADER = [
  "Rank",
  "City",
  "Country",
  "Airport",
  "Total t CO2",
  "Per person t CO2",
  "Avg flight h",
  "Avg jetlag h",
  "Share with 6h+ jetlag %",
  "Share in business class %"
];

// Text that a spreadsheet could read as a formula gets a leading apostrophe, so it stays text.
function csvText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

// RFC 4180: quote fields holding a comma, quote or line break, and double any inner quotes.
function csvField(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The comparison as CSV text: every scored city, in the given sort order, with CRLF line endings.
// Rank is always by total emissions (lowest = 1), whatever the sort. Cells are plain numbers.
// No byte-order mark here; the download adds one so Excel reads the file as UTF-8.
export function comparisonCsv(scores, { sortKey = "total", direction = "asc" } = {}) {
  const rank = new Map(sortScores(scores, "total", "asc").map((score, index) => [score.destination.code, index + 1]));
  const rows = sortScores(scores, sortKey, direction).map((score) => {
    const d = score.destination;
    return [
      rank.get(d.code),
      csvText(d.city),
      csvText(d.country),
      csvText(d.code),
      (score.totalEmissionsKg / 1000).toFixed(2),
      (score.averageEmissionsKg / 1000).toFixed(2),
      score.averageHours.toFixed(1),
      score.jetlagScore.toFixed(1),
      Math.round(score.severeJetlagShare * 100),
      Math.round(score.businessShare * 100)
    ];
  });
  return [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

function factorsDifferFromDefault(factors) {
  const d = DESNZ_2026.factorsKgPerPkm;
  const pairs = [
    [factors.domestic, d.domestic],
    [factors.shortHaul.economy, d.shortHaul.economy],
    [factors.shortHaul.business, d.shortHaul.business],
    [factors.longHaul.economy, d.longHaul.economy],
    [factors.longHaul.business, d.longHaul.business]
  ];
  return pairs.some(([a, b]) => Math.abs(a - b) > 1e-9);
}

const countOf = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Short plain-English lines describing the assumptions behind the figures, for the print header.
export function assumptionLines(policy, { placedPeople, placedGroups, unplacedGroups, shortlist = [] }) {
  const hours = policy.threshold;
  const uplift = Math.round((policy.distanceUplift - 1) * 100);
  return [
    policy.returnTrip ? "Return journeys" : "One-way journeys",
    `Business class over ${hours} ${hours === 1 ? "hour" : "hours"}`,
    policy.nonCo2Multiplier > 1 ? `Non-CO2 uplift \u00d7${policy.nonCo2Multiplier}` : "Non-CO2 off",
    factorsDifferFromDefault(policy.factors) ? "Factors: custom" : "Factors: DESNZ 2026",
    `Distance +${uplift}%`,
    `${countOf(placedPeople, "person", "people")} in ${countOf(placedGroups, "group", "groups")} placed; ${countOf(unplacedGroups, "group", "groups")} not placed`,
    shortlist.length
      ? `Host cities: shortlist of ${shortlist.length} (${shortlist.join(", ")})`
      : `Host cities: all ${AIRPORTS.length}`
  ];
}

export function normalizeImportedRow(row) {
  const pick = (...keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== "");
  return {
    location: pick("location", "city", "place", "origin", "attendeelocation"),
    country: pick("country", "nation"),
    people: pick("people", "attendees", "count", "number", "quantity"),
    airport: pick("airport", "iata", "airportcode", "originairport")
  };
}

function detectDelimiter(text) {
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (Object.values(counts).some(Boolean)) break; // first non-blank line is the header
    } else if (!quoted && char in counts) counts[char] += 1;
  }
  let best = ",";
  for (const candidate of [",", "\t", ";"]) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

// Parses CSV/TSV text with a state machine, so quoted fields can hold delimiters, doubled quotes
// and line breaks. The delimiter is detected from the header line.
export function parseCsv(input) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    record.push(field.trim());
    field = "";
  };
  const endRecord = () => {
    endField();
    if (record.some((cell) => cell !== "")) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
    } else {
      field += char;
    }
  }
  endRecord();

  if (!records.length) return [];
  const headers = records[0].map((header) => normalize(header).replace(/\s+/g, ""));
  return records.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return normalizeImportedRow(row);
  });
}
