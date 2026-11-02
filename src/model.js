// The model: airports, location matching, parsing and scoring. Pure functions only, with no
// access to `document` or `window`, so `node --test` can exercise it directly.

// One airport per candidate city. `hub: true` marks the main international gateway for a country
// with several airports; it is used when we only know the country. `aliases` are alternative
// city names (already plain ASCII, lower case is fine: they are normalised before matching).
export const AIRPORTS = [
  { code: "ATL", city: "Atlanta", country: "United States", lat: 33.64, lon: -84.43, tz: -5 },
  { code: "JFK", city: "New York", country: "United States", lat: 40.64, lon: -73.78, tz: -5, hub: true, aliases: ["nyc", "new york city", "manhattan", "brooklyn"] },
  { code: "LAX", city: "Los Angeles", country: "United States", lat: 33.94, lon: -118.41, tz: -8 },
  { code: "ORD", city: "Chicago", country: "United States", lat: 41.98, lon: -87.91, tz: -6 },
  { code: "YYZ", city: "Toronto", country: "Canada", lat: 43.68, lon: -79.63, tz: -5, hub: true },
  { code: "MEX", city: "Mexico City", country: "Mexico", lat: 19.44, lon: -99.07, tz: -6 },
  { code: "GRU", city: "Sao Paulo", country: "Brazil", lat: -23.43, lon: -46.47, tz: -3, hub: true },
  { code: "EZE", city: "Buenos Aires", country: "Argentina", lat: -34.82, lon: -58.54, tz: -3 },
  { code: "SCL", city: "Santiago", country: "Chile", lat: -33.39, lon: -70.79, tz: -4 },
  { code: "BOG", city: "Bogota", country: "Colombia", lat: 4.7, lon: -74.15, tz: -5 },
  { code: "LHR", city: "London", country: "United Kingdom", lat: 51.47, lon: -0.45, tz: 0, hub: true },
  { code: "CDG", city: "Paris", country: "France", lat: 49.01, lon: 2.55, tz: 1 },
  { code: "AMS", city: "Amsterdam", country: "Netherlands", lat: 52.31, lon: 4.76, tz: 1 },
  { code: "FRA", city: "Frankfurt", country: "Germany", lat: 50.04, lon: 8.56, tz: 1, hub: true },
  { code: "MAD", city: "Madrid", country: "Spain", lat: 40.49, lon: -3.57, tz: 1, hub: true },
  { code: "FCO", city: "Rome", country: "Italy", lat: 41.8, lon: 12.25, tz: 1, hub: true },
  { code: "ZRH", city: "Zurich", country: "Switzerland", lat: 47.46, lon: 8.55, tz: 1, hub: true },
  { code: "CPH", city: "Copenhagen", country: "Denmark", lat: 55.62, lon: 12.65, tz: 1 },
  { code: "ARN", city: "Stockholm", country: "Sweden", lat: 59.65, lon: 17.92, tz: 1 },
  { code: "HEL", city: "Helsinki", country: "Finland", lat: 60.32, lon: 24.97, tz: 2 },
  { code: "DUB", city: "Dublin", country: "Ireland", lat: 53.43, lon: -6.25, tz: 0 },
  { code: "IST", city: "Istanbul", country: "Turkey", lat: 41.28, lon: 28.75, tz: 3, aliases: ["constantinople"] },
  { code: "DXB", city: "Dubai", country: "United Arab Emirates", lat: 25.25, lon: 55.36, tz: 4 },
  { code: "DOH", city: "Doha", country: "Qatar", lat: 25.27, lon: 51.61, tz: 3 },
  { code: "CAI", city: "Cairo", country: "Egypt", lat: 30.12, lon: 31.41, tz: 2 },
  { code: "JNB", city: "Johannesburg", country: "South Africa", lat: -26.14, lon: 28.25, tz: 2, hub: true },
  { code: "LOS", city: "Lagos", country: "Nigeria", lat: 6.58, lon: 3.32, tz: 1 },
  { code: "NBO", city: "Nairobi", country: "Kenya", lat: -1.32, lon: 36.93, tz: 3 },
  { code: "DEL", city: "Delhi", country: "India", lat: 28.56, lon: 77.1, tz: 5.5, hub: true, aliases: ["new delhi"] },
  { code: "BOM", city: "Mumbai", country: "India", lat: 19.09, lon: 72.87, tz: 5.5, aliases: ["bombay"] },
  { code: "BKK", city: "Bangkok", country: "Thailand", lat: 13.69, lon: 100.75, tz: 7 },
  { code: "SIN", city: "Singapore", country: "Singapore", lat: 1.36, lon: 103.99, tz: 8 },
  { code: "HKG", city: "Hong Kong", country: "Hong Kong", lat: 22.31, lon: 113.92, tz: 8 },
  { code: "PVG", city: "Shanghai", country: "China", lat: 31.14, lon: 121.81, tz: 8, hub: true },
  { code: "PEK", city: "Beijing", country: "China", lat: 40.08, lon: 116.58, tz: 8 },
  { code: "HND", city: "Tokyo", country: "Japan", lat: 35.55, lon: 139.78, tz: 9, hub: true },
  { code: "ICN", city: "Seoul", country: "South Korea", lat: 37.46, lon: 126.44, tz: 9 },
  { code: "SYD", city: "Sydney", country: "Australia", lat: -33.94, lon: 151.18, tz: 10, hub: true },
  { code: "MEL", city: "Melbourne", country: "Australia", lat: -37.67, lon: 144.84, tz: 10 },
  { code: "AKL", city: "Auckland", country: "New Zealand", lat: -37.01, lon: 174.79, tz: 12 },
  { code: "SFO", city: "San Francisco", country: "United States", lat: 37.62, lon: -122.38, tz: -8, aliases: ["bay area", "san fran"] },
  { code: "SEA", city: "Seattle", country: "United States", lat: 47.45, lon: -122.31, tz: -8 },
  { code: "BOS", city: "Boston", country: "United States", lat: 42.36, lon: -71.01, tz: -5 },
  { code: "IAD", city: "Washington", country: "United States", lat: 38.95, lon: -77.46, tz: -5, aliases: ["washington dc", "dc"] },
  { code: "MIA", city: "Miami", country: "United States", lat: 25.79, lon: -80.29, tz: -5 },
  { code: "DFW", city: "Dallas", country: "United States", lat: 32.9, lon: -97.04, tz: -6, aliases: ["fort worth"] },
  { code: "DEN", city: "Denver", country: "United States", lat: 39.86, lon: -104.67, tz: -7 },
  { code: "IAH", city: "Houston", country: "United States", lat: 29.98, lon: -95.34, tz: -6 },
  { code: "PHX", city: "Phoenix", country: "United States", lat: 33.43, lon: -112.01, tz: -7 },
  { code: "MSP", city: "Minneapolis", country: "United States", lat: 44.88, lon: -93.22, tz: -6, aliases: ["saint paul", "st paul"] },
  { code: "HNL", city: "Honolulu", country: "United States", lat: 21.32, lon: -157.92, tz: -10 },
  { code: "YVR", city: "Vancouver", country: "Canada", lat: 49.19, lon: -123.18, tz: -8 },
  { code: "YUL", city: "Montreal", country: "Canada", lat: 45.47, lon: -73.74, tz: -5 },
  { code: "MAN", city: "Manchester", country: "United Kingdom", lat: 53.35, lon: -2.27, tz: 0 },
  { code: "EDI", city: "Edinburgh", country: "United Kingdom", lat: 55.95, lon: -3.37, tz: 0 },
  { code: "BHX", city: "Birmingham", country: "United Kingdom", lat: 52.45, lon: -1.75, tz: 0 },
  { code: "WAW", city: "Warsaw", country: "Poland", lat: 52.17, lon: 20.97, tz: 1 },
  { code: "LIS", city: "Lisbon", country: "Portugal", lat: 38.77, lon: -9.13, tz: 0 },
  { code: "BCN", city: "Barcelona", country: "Spain", lat: 41.3, lon: 2.08, tz: 1 },
  { code: "MUC", city: "Munich", country: "Germany", lat: 48.35, lon: 11.79, tz: 1, aliases: ["munchen"] },
  { code: "BER", city: "Berlin", country: "Germany", lat: 52.36, lon: 13.5, tz: 1 },
  { code: "VIE", city: "Vienna", country: "Austria", lat: 48.11, lon: 16.57, tz: 1, aliases: ["wien"] },
  { code: "BRU", city: "Brussels", country: "Belgium", lat: 50.9, lon: 4.48, tz: 1 },
  { code: "PRG", city: "Prague", country: "Czech Republic", lat: 50.1, lon: 14.26, tz: 1, aliases: ["praha"] },
  { code: "OSL", city: "Oslo", country: "Norway", lat: 60.19, lon: 11.1, tz: 1 },
  { code: "ATH", city: "Athens", country: "Greece", lat: 37.94, lon: 23.94, tz: 2 },
  { code: "BUD", city: "Budapest", country: "Hungary", lat: 47.44, lon: 19.26, tz: 1 },
  { code: "MXP", city: "Milan", country: "Italy", lat: 45.63, lon: 8.72, tz: 1, aliases: ["milano"] },
  { code: "GVA", city: "Geneva", country: "Switzerland", lat: 46.24, lon: 6.11, tz: 1 },
  { code: "TLV", city: "Tel Aviv", country: "Israel", lat: 32.01, lon: 34.89, tz: 2 },
  { code: "RUH", city: "Riyadh", country: "Saudi Arabia", lat: 24.96, lon: 46.7, tz: 3 },
  { code: "CMN", city: "Casablanca", country: "Morocco", lat: 33.37, lon: -7.59, tz: 1 },
  { code: "ADD", city: "Addis Ababa", country: "Ethiopia", lat: 8.98, lon: 38.8, tz: 3 },
  { code: "ACC", city: "Accra", country: "Ghana", lat: 5.6, lon: -0.17, tz: 0 },
  { code: "CPT", city: "Cape Town", country: "South Africa", lat: -33.97, lon: 18.6, tz: 2 },
  { code: "KUL", city: "Kuala Lumpur", country: "Malaysia", lat: 2.75, lon: 101.71, tz: 8 },
  { code: "CGK", city: "Jakarta", country: "Indonesia", lat: -6.13, lon: 106.66, tz: 7 },
  { code: "MNL", city: "Manila", country: "Philippines", lat: 14.51, lon: 121.02, tz: 8 },
  { code: "SGN", city: "Ho Chi Minh City", country: "Vietnam", lat: 10.82, lon: 106.66, tz: 7, aliases: ["saigon"] },
  { code: "TPE", city: "Taipei", country: "Taiwan", lat: 25.08, lon: 121.23, tz: 8 },
  { code: "KIX", city: "Osaka", country: "Japan", lat: 34.43, lon: 135.24, tz: 9 },
  { code: "CAN", city: "Guangzhou", country: "China", lat: 23.39, lon: 113.3, tz: 8, aliases: ["canton"] },
  { code: "BLR", city: "Bengaluru", country: "India", lat: 13.2, lon: 77.71, tz: 5.5, aliases: ["bangalore"] },
  { code: "KHI", city: "Karachi", country: "Pakistan", lat: 24.91, lon: 67.16, tz: 5 },
  { code: "DAC", city: "Dhaka", country: "Bangladesh", lat: 23.84, lon: 90.4, tz: 6 },
  { code: "BNE", city: "Brisbane", country: "Australia", lat: -27.38, lon: 153.12, tz: 10 },
  { code: "PER", city: "Perth", country: "Australia", lat: -31.94, lon: 115.97, tz: 8 },
  { code: "LIM", city: "Lima", country: "Peru", lat: -12.02, lon: -77.11, tz: -5 },
  { code: "GIG", city: "Rio de Janeiro", country: "Brazil", lat: -22.81, lon: -43.25, tz: -3, aliases: ["rio"] },
  { code: "PTY", city: "Panama City", country: "Panama", lat: 9.07, lon: -79.38, tz: -5 }
];

// Keys are normalised (lower case, punctuation turned into single spaces), because lookups
// happen after normalize(): "U.S." arrives as "u s".
export const COUNTRY_ALIASES = new Map([
  ["usa", "United States"],
  ["us", "United States"],
  ["u s", "United States"],
  ["u s a", "United States"],
  ["america", "United States"],
  ["united states of america", "United States"],
  ["uk", "United Kingdom"],
  ["u k", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["britain", "United Kingdom"],
  ["england", "United Kingdom"],
  ["scotland", "United Kingdom"],
  ["wales", "United Kingdom"],
  ["northern ireland", "United Kingdom"],
  ["uae", "United Arab Emirates"],
  ["u a e", "United Arab Emirates"],
  ["korea", "South Korea"],
  ["republic of korea", "South Korea"],
  ["korea republic", "South Korea"],
  ["holland", "Netherlands"],
  ["the netherlands", "Netherlands"],
  ["deutschland", "Germany"],
  ["prc", "China"],
  ["peoples republic of china", "China"],
  ["people s republic of china", "China"],
  ["mainland china", "China"],
  ["czechia", "Czech Republic"],
  ["viet nam", "Vietnam"],
  ["the philippines", "Philippines"],
  ["ksa", "Saudi Arabia"],
  ["turkiye", "Turkey"],
  ["hk", "Hong Kong"],
  ["nz", "New Zealand"]
]);

export const SAMPLE_ROWS = [
  { location: "London", country: "United Kingdom", people: 42 },
  { location: "New York", country: "United States", people: 18 },
  { location: "Singapore", country: "Singapore", people: 9 },
  { location: "Delhi", country: "India", people: 14 },
  { location: "Sydney", country: "Australia", people: 7 },
  { location: "Sao Paulo", country: "Brazil", people: 11 }
];

export const DEFAULT_POLICY = {
  threshold: 6,
  economyFactor: 0.115,
  businessMultiplier: 2.8,
  nonCo2Multiplier: 1.9,
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

export function airportByCode(code) {
  return AIRPORTS.find((airport) => airport.code === code) || null;
}

const KNOWN_COUNTRIES = new Set(AIRPORTS.map((airport) => airport.country));

// Every phrase that names a country, normalised, for spotting a country inside a location.
const COUNTRY_TERMS = [
  ...[...KNOWN_COUNTRIES].map((country) => ({ term: normalize(country), country })),
  ...[...COUNTRY_ALIASES].map(([term, country]) => ({ term, country }))
].filter((entry) => KNOWN_COUNTRIES.has(entry.country));

// Every phrase that names a city, normalised.
const CITY_NAMES = AIRPORTS.flatMap((airport) =>
  [airport.city, ...(airport.aliases || [])].map((name) => ({ airport, name: normalize(name) }))
);

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
    const match = airportByCode(explicit);
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

// Emissions for one group's travel. Return trips (the default) double the one-way figure.
export function emissionsForLeg(distanceKm, hours, people, policy) {
  const cabinMultiplier = hours > policy.threshold ? policy.businessMultiplier : 1;
  const trips = policy.returnTrip === false ? 1 : 2;
  return distanceKm * people * policy.economyFactor * cabinMultiplier * policy.nonCo2Multiplier * trips;
}

// Groups without an airport are left out of every total.
export function scoreDestination(destination, groups, policy) {
  let totalEmissionsKg = 0;
  let totalPeople = 0;
  let weightedHours = 0;
  let weightedJetlag = 0;
  let businessClassPeople = 0;
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
    drivers
  };
}

// Every candidate city, lowest total emissions first.
export function scoreAll(groups, policy) {
  return AIRPORTS.map((airport) => scoreDestination(airport, groups, policy)).sort(
    (a, b) => a.totalEmissionsKg - b.totalEmissionsKg
  );
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
