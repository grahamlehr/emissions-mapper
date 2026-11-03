// The airport dataset, its indexes and the location matcher. Pure functions only, with no access
// to `document` or `window`. src/model.js re-exports everything the rest of the app needs.
//
// Call `installDataset` once at start-up with data/airports.json and data/overrides.json. The
// place names (data/places.json, about 34,000 GeoNames places) are bigger, so `installPlaces`
// can be called later; until then matching still works from the hosts, their aliases, airport
// municipalities and countries.
//
// The pipeline in `guessAirport` is described in docs/PLAN-airports.md ("Matching pipeline").

// AIRPORTS is the list of candidate host cities, one record per city: { code, city, country, lat,
// lon, tz, hub, aliases }. `hub: true` marks the main international gateway for a country with
// several airports; it is used when we only know the country. It is a live binding, replaced when
// the dataset is installed.
export let AIRPORTS = [];

// Keys are normalised (lower case, punctuation turned into single spaces), because lookups
// happen after normalize(): "U.S." arrives as "u s". Values are country names.
export let COUNTRY_ALIASES = new Map();

const FOLDS = { "ø": "o", "ł": "l", "đ": "d", "ð": "d", "ı": "i", "ß": "ss", "æ": "ae", "œ": "oe", "þ": "th" };

// Lower case, diacritics folded (São Paulo, Zürich, Kraków, Łódź), punctuation turned into single
// spaces.
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[øłđðıßæœþ]/g, (char) => FOLDS[char])
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// The form names are compared in. On top of normalize(): "saint" and "sankt" become "st", and
// runs of single letters are joined ("d c" becomes "dc"), so St. Louis = Saint Louis and
// Washington D.C. = Washington DC.
function nameKey(text) {
  const words = normalize(text).split(" ");
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length > 1) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const word of words) {
    if (word.length === 1 && /[a-z]/.test(word)) {
      run.push(word);
      continue;
    }
    flush();
    out.push(word === "saint" || word === "sankt" ? "st" : word);
  }
  flush();
  return out.join(" ");
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

// ---- Dataset state ----------------------------------------------------------------------------

let ALL_AIRPORTS = [];
let AIRPORTS_BY_CODE = new Map();
let AIRPORTS_BY_ICAO = new Map();
let METRO_CODES = new Map();
let ADMIN1_BY_AIRPORT = new Map(); // IATA -> GeoNames admin1 code of the airport's region ("" if unknown)
let ISO_TO_NAME = new Map();
let COUNTRY_TOKENS = new Map(); // key -> Set of ISO-2
let REGION_TOKENS = new Map(); // key -> Set of "ISO|admin1"
let REGION_NAMES = new Map(); // "ISO|admin1" -> name
let ALIASES = new Map(); // key -> airport code
let PSEUDO_INDEX = new Map(); // key -> places made from airport municipalities
let PSEUDO_BY_COUNTRY = new Map();
let GRID = new Map();
let LARGE_BY_COUNTRY = new Map();
let MEDIUM_BY_COUNTRY = new Map();

let PLACE_INDEX = new Map(); // key -> real places
let PLACE_ENTRIES_BY_COUNTRY = new Map(); // ISO -> [[key, place]]
let TYPO_INDEXES = new Map();
let BIGGEST_PLACE = new Map(); // ISO -> most populous place
let BIGGEST_IN_REGION = new Map(); // "ISO|admin1" -> most populous place
let REGION_BY_NAME = new Map(); // full region name key -> Set of "ISO|admin1"
let PLACES_INSTALLED = false;

// Turns a { fields, rows } table into an array of objects.
function tableObjects(table) {
  return table.rows.map((row) => Object.fromEntries(table.fields.map((field, index) => [field, row[index]])));
}

const addTo = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};
const addToSet = (map, key, value) => {
  if (!key) return;
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
};

const cellOf = (lat, lon) => (Math.floor(lat) + 90) * 400 + (Math.floor(lon) + 180);

// OurAirports keywords are mostly "<Country> airports" in assorted languages. Keep the plain
// Latin-script names (UAE, Eire, Brasil) and drop the rest.
const LATIN_NAME = /^[\p{Script=Latin}\s.'’-]+$/u;
const sensibleKeyword = (keyword) =>
  LATIN_NAME.test(keyword) && !/airport/i.test(keyword) && normalize(keyword).split(" ").length <= 4;

export function installDataset({ airports, overrides }) {
  const countryRows = tableObjects(airports.countries);
  ISO_TO_NAME = new Map(countryRows.map((c) => [c.iso2, c.name]));
  const countryNames = overrides.countryNames || {};
  for (const [iso, name] of Object.entries(countryNames)) ISO_TO_NAME.set(iso, name);
  const countryName = (iso) => ISO_TO_NAME.get(iso) || iso;

  // Regions: abbreviation -> GeoNames admin1 code, and every way of writing a region.
  const regionRows = tableObjects(airports.regions);
  const admin1ByAbbr = new Map();
  REGION_TOKENS = new Map();
  REGION_NAMES = new Map();
  REGION_BY_NAME = new Map();
  for (const region of regionRows) {
    const id = `${region.country}|${region.admin1}`;
    REGION_NAMES.set(id, region.name);
    if (nameKey(region.name).length >= 4) addToSet(REGION_BY_NAME, nameKey(region.name), id);
    if (region.abbr) admin1ByAbbr.set(`${region.country}|${region.abbr}`, region.admin1);
    addToSet(REGION_TOKENS, nameKey(region.name), id);
    if (region.abbr) addToSet(REGION_TOKENS, region.abbr.toLowerCase(), id);
    if (/^[A-Za-z]{2,3}$/.test(region.admin1)) addToSet(REGION_TOKENS, region.admin1.toLowerCase(), id);
  }

  // Airports OurAirports labels "large" that are secondary to their city's main airport are
  // treated as medium (overrides.minorAirports).
  const minorAirports = new Set(overrides.minorAirports || []);
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
    size: minorAirports.has(a.iata) ? "M" : a.size,
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
  AIRPORTS_BY_ICAO = new Map(ALL_AIRPORTS.filter((a) => a.icao).map((a) => [a.icao.toUpperCase(), a]));

  COUNTRY_ALIASES = new Map(Object.entries(overrides.countryAliases || {}));
  METRO_CODES = new Map(Object.entries(overrides.metro || {}).filter(([, code]) => AIRPORTS_BY_CODE.has(code)));

  // Every way of naming a country: ISO codes, GeoNames names, display names, plain keywords,
  // aliases, and extra tokens such as SA for South Africa.
  COUNTRY_TOKENS = new Map();
  for (const c of countryRows) {
    addToSet(COUNTRY_TOKENS, c.iso2.toLowerCase(), c.iso2);
    addToSet(COUNTRY_TOKENS, (c.iso3 || "").toLowerCase(), c.iso2);
    addToSet(COUNTRY_TOKENS, nameKey(c.name), c.iso2);
    for (const keyword of c.keywords || []) if (sensibleKeyword(keyword)) addToSet(COUNTRY_TOKENS, nameKey(keyword), c.iso2);
  }
  for (const [iso, name] of ISO_TO_NAME) addToSet(COUNTRY_TOKENS, nameKey(name), iso);
  const isoByName = new Map([...ISO_TO_NAME].map(([iso, name]) => [nameKey(name), iso]));
  for (const [alias, name] of COUNTRY_ALIASES) {
    const iso = isoByName.get(nameKey(name));
    if (iso) addToSet(COUNTRY_TOKENS, nameKey(alias), iso);
  }
  for (const [token, list] of Object.entries(overrides.countryTokens || {})) {
    for (const iso of list) addToSet(COUNTRY_TOKENS, nameKey(token), iso);
  }

  // Aliases: the hosts' own, plus the general ones in overrides.aliases.
  ALIASES = new Map();
  for (const host of AIRPORTS) for (const alias of host.aliases || []) ALIASES.set(nameKey(alias), host.code);
  for (const [alias, code] of Object.entries(overrides.aliases || {})) {
    if (AIRPORTS_BY_CODE.has(code)) ALIASES.set(nameKey(alias), code);
  }

  // Airport regions, a spatial grid, and the pseudo-places made from airport municipalities.
  ADMIN1_BY_AIRPORT = new Map();
  GRID = new Map();
  LARGE_BY_COUNTRY = new Map();
  MEDIUM_BY_COUNTRY = new Map();
  const groups = new Map();
  for (const airport of ALL_AIRPORTS) {
    const abbr = (airport.region || "").split("-").slice(1).join("-");
    const admin1 = admin1ByAbbr.get(`${airport.countryCode}|${abbr}`) || "";
    ADMIN1_BY_AIRPORT.set(airport.code, admin1);
    addTo(GRID, cellOf(airport.lat, airport.lon), airport);
    addTo(airport.size === "L" ? LARGE_BY_COUNTRY : MEDIUM_BY_COUNTRY, airport.countryCode, airport);
    if (!airport.municipality) continue;
    // "London, Essex", "Sydney (Mascot)" and "Allentown/Bethlehem" are grouped by their first name.
    const base = nameKey(airport.municipality.split(/[/,(]/)[0]);
    if (!base) continue;
    const groupId = `${airport.countryCode}|${admin1}|${base}`;
    if (!groups.has(groupId)) groups.set(groupId, { name: airport.municipality, country: airport.countryCode, admin1, airports: [] });
    groups.get(groupId).airports.push(airport);
  }
  PSEUDO_INDEX = new Map();
  PSEUDO_BY_COUNTRY = new Map();
  const rank = (airport) => (airport.hub ? 0 : AIRPORTS.includes(airport) ? 1 : airport.size === "L" ? 2 : 3);
  for (const group of groups.values()) {
    const rep = [...group.airports].sort((a, b) => rank(a) - rank(b))[0];
    const place = { name: group.name.split(/[/,(]/)[0].trim() || group.name, country: group.country, admin1: group.admin1, lat: rep.lat, lon: rep.lon, population: 0, pseudo: true };
    const keys = new Set();
    const text = group.name;
    keys.add(nameKey(text));
    keys.add(nameKey(text.replace(/\([^)]*\)/g, " ")));
    for (const part of text.split(/[/,]/)) keys.add(nameKey(part.replace(/\([^)]*\)/g, " ")));
    for (const key of keys) {
      if (!key) continue;
      addTo(PSEUDO_INDEX, key, place);
      addTo(PSEUDO_BY_COUNTRY, group.country, [key, place]);
    }
  }

  PLACE_INDEX = new Map();
  PLACE_ENTRIES_BY_COUNTRY = new Map();
  TYPO_INDEXES = new Map();
  BIGGEST_PLACE = new Map();
  BIGGEST_IN_REGION = new Map();
  PLACES_INSTALLED = false;
}

// Adds the GeoNames place names (the parsed contents of data/places.json). Safe to call once,
// after installDataset.
export function installPlaces(placesJson) {
  const table = placesJson.places;
  const index = new Map();
  const byCountry = new Map();
  const biggest = new Map();
  const biggestInRegion = new Map();
  for (const row of table.rows) {
    const [name, asciiname, alternates, country, admin1, lat, lon, population] = row;
    const place = { name, country, admin1, lat, lon, population, pseudo: false };
    const keys = new Set([nameKey(name)]);
    if (asciiname) keys.add(nameKey(asciiname));
    if (alternates) for (const alternate of alternates.split("|")) keys.add(nameKey(alternate));
    for (const key of keys) {
      if (!key) continue;
      addTo(index, key, place);
      addTo(byCountry, country, [key, place]);
    }
    const best = biggest.get(country);
    if (!best || population > best.population) biggest.set(country, place);
    const regionId = `${country}|${admin1}`;
    const inRegion = biggestInRegion.get(regionId);
    if (!inRegion || population > inRegion.population) biggestInRegion.set(regionId, place);
  }
  BIGGEST_IN_REGION = biggestInRegion;
  PLACE_INDEX = index;
  PLACE_ENTRIES_BY_COUNTRY = byCountry;
  BIGGEST_PLACE = biggest;
  TYPO_INDEXES = new Map();
  PLACES_INSTALLED = true;
}

export function placesInstalled() {
  return PLACES_INSTALLED;
}

// Every airport in the dataset (large and medium, with scheduled service), not just the hosts.
export function allAirports() {
  return ALL_AIRPORTS;
}

// Metro codes (LON, NYC...) mapped to the airport code that stands for the area.
export function metroCodes() {
  return METRO_CODES;
}

// ---- Lookups ----------------------------------------------------------------------------------

// Looks up any airport in the full list, not just the host cities.
export function airportByCode(code) {
  return AIRPORTS_BY_CODE.get(code) || null;
}

// Looks up a host city only.
export function hostByCode(code) {
  return AIRPORTS.find((airport) => airport.code === code) || null;
}

// An IATA code, a 4-letter ICAO code or a metro code (LON...) to an airport, or null.
export function airportForCode(text) {
  const code = String(text ?? "").trim().toUpperCase();
  if (code.length === 3) {
    return AIRPORTS_BY_CODE.get(code) || AIRPORTS_BY_CODE.get(METRO_CODES.get(code)) || null;
  }
  if (code.length === 4) return AIRPORTS_BY_ICAO.get(code) || null;
  return null;
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// The set of ISO-2 codes a country phrase could mean, or null when it isn't a country.
function countriesFor(text) {
  const key = nameKey(text);
  if (NOT_A_PLACE.has(key)) return null; // "N/A" is not Namibia
  const set = COUNTRY_TOKENS.get(key);
  return set && set.size ? set : null;
}

export function canonicalCountry(value) {
  const key = normalize(value);
  if (!key) return "";
  if (COUNTRY_ALIASES.has(key)) return COUNTRY_ALIASES.get(key);
  const set = countriesFor(key);
  if (set && set.size === 1) return ISO_TO_NAME.get([...set][0]) || titleCase(key);
  return titleCase(key);
}

// What a trailing part such as "CA", "Ontario" or "Scotland" can mean: a country, a region (state,
// province...) or both. Null when it is neither.
function tokenInfo(text) {
  const key = nameKey(text);
  if (!key) return null;
  const countries = NOT_A_PLACE.has(key) ? null : COUNTRY_TOKENS.get(key) || null;
  const regions = REGION_TOKENS.get(key) || null;
  return countries || regions ? { countries, regions } : null;
}

// A place or airport satisfies a token if its country is one the token can mean, or its region is
// one the token can mean within the place's own country.
function satisfies(info, country, admin1) {
  if (info.countries && info.countries.has(country)) return true;
  return Boolean(info.regions && admin1 && info.regions.has(`${country}|${admin1}`));
}

// ---- From a place to an airport ---------------------------------------------------------------

function nearbyAirports(lat, lon, radiusKm) {
  const found = [];
  const dLat = Math.ceil(radiusKm / 111);
  const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const dLon = Math.min(180, Math.ceil(radiusKm / (111 * cos)));
  const latCell = Math.floor(lat);
  const lonCell = Math.floor(lon);
  for (let i = latCell - dLat; i <= latCell + dLat; i += 1) {
    if (i < -90 || i > 89) continue;
    for (let j = lonCell - dLon; j <= lonCell + dLon; j += 1) {
      const wrapped = ((((j + 180) % 360) + 360) % 360) - 180;
      const list = GRID.get((i + 90) * 400 + (wrapped + 180));
      if (list) found.push(...list);
    }
  }
  return found;
}

// Picks one airport from a list sorted nearest first. Hosts are the curated major gateways, so a
// host within 20 km of the nearest airport is preferred to it (Amsterdam over Rotterdam for
// Leiden). If the pick is not a host and another airport is also within 20 km of it, the caller
// is told, so the match can be marked "check".
function choose(list) {
  const nearest = list[0];
  const host = list.find((entry) => AIRPORTS.includes(entry.airport) && entry.km <= nearest.km + 20);
  const picked = host || nearest;
  const others = AIRPORTS.includes(picked.airport)
    ? []
    : list.filter((entry) => entry !== picked && entry.km <= picked.km + 20).map((entry) => entry.airport.code);
  return { airport: picked.airport, km: picked.km, far: false, others };
}

// The airport a person living at this place would fly from, in this order:
//   a) the nearest large airport within 50 km;
//   b) else a medium airport within 10 km (the city's own airport);
//   c) else the nearest large within 100 km (people drive past a regional strip to a hub);
//   d) else the nearest medium within 50 km;
//   e) else the nearest large within 150 km; f) else the nearest medium within 100 km;
//   g) else the nearest large in the same country, whatever the distance (the caller marks it
//      "check").
// Any country is allowed in a) to f), so Malmö can use Copenhagen.
function airportForPlace(place) {
  if (place.airport !== undefined) return place.airport;
  const large = [];
  const medium = [];
  for (const airport of nearbyAirports(place.lat, place.lon, 150)) {
    const entry = { airport, km: haversineKm(place, airport) };
    (airport.size === "L" ? large : medium).push(entry);
  }
  large.sort((a, b) => a.km - b.km);
  medium.sort((a, b) => a.km - b.km);
  const within = (list, km) => list.filter((entry) => entry.km <= km);
  let result = null;
  const tiers = [
    [large, 50],
    [medium, 10],
    [large, 100],
    [medium, 50],
    [large, 150],
    [medium, 100]
  ];
  const tier = tiers.find(([list, km]) => within(list, km).length);
  if (tier) result = choose(within(tier[0], tier[1]));
  else {
    const pool = LARGE_BY_COUNTRY.get(place.country) || MEDIUM_BY_COUNTRY.get(place.country) || [];
    const list = pool.map((airport) => ({ airport, km: haversineKm(place, airport) })).sort((a, b) => a.km - b.km);
    if (list.length) result = { ...choose(list), far: true };
  }
  place.airport = result;
  return result;
}

// ---- Typos ------------------------------------------------------------------------------------

// Damerau-Levenshtein distance (optimal string alignment). Gives up above `max`.
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// Names grouped by first letter (a typo rarely changes the first letter), for the countries asked
// about, or for every place of 100,000 or more when no country is known.
function typoIndex(countries) {
  const id = countries ? [...countries].sort().join(",") : "*";
  let index = TYPO_INDEXES.get(id);
  if (index) return index;
  index = new Map();
  const add = (key, place) => addTo(index, key[0], [key, place]);
  const isos = countries ? [...countries] : [...PLACE_ENTRIES_BY_COUNTRY.keys()];
  for (const iso of isos) {
    for (const [key, place] of PLACE_ENTRIES_BY_COUNTRY.get(iso) || []) {
      if (countries || place.population >= 100000) add(key, place);
    }
    if (countries) for (const [key, place] of PSEUDO_BY_COUNTRY.get(iso) || []) add(key, place);
  }
  TYPO_INDEXES.set(id, index);
  return index;
}

// Words that are not places and shouldn't be "corrected" into one.
const NOT_A_PLACE = new Set([
  "remote", "tbc", "tba", "n a", "na", "online", "virtual", "various", "home", "home office", "unknown",
  "other", "anywhere", "multiple", "global", "worldwide", "international", "europe", "asia", "africa",
  "emea", "apac", "americas", "north america", "south america", "latam", "oceania"
]);

function findTypo(key, countries, accepts) {
  if (key.length < 5 || NOT_A_PLACE.has(key)) return null;
  const max = key.length >= 9 ? 2 : 1;
  let best = null;
  for (const [candidate, place] of typoIndex(countries).get(key[0]) || []) {
    if (!accepts(place)) continue;
    const distance = editDistance(key, candidate, max);
    if (distance > max || distance === 0) continue;
    if (!best || distance < best.distance || (distance === best.distance && place.population > best.place.population)) {
      best = { place, distance };
    }
  }
  return best ? best.place : null;
}

// ---- Matching ---------------------------------------------------------------------------------

const countryNameOf = (iso) => ISO_TO_NAME.get(iso) || iso;

function placeInfo(place) {
  return {
    name: place.name,
    country: countryNameOf(place.country),
    admin1: REGION_NAMES.get(`${place.country}|${place.admin1}`) || "",
    population: place.population
  };
}

const rounded = (km) => Math.round(km);

// Splits "Sydney NSW" or "Perth Western Australia" into a name and trailing words that mean a
// country or region (at most two such tokens, each up to three words).
function peel(words) {
  const tokens = [];
  let rest = words;
  for (let round = 0; round < 2; round += 1) {
    let found = false;
    for (let size = Math.min(3, rest.length - 1); size >= 1; size -= 1) {
      const suffix = rest.slice(rest.length - size).join(" ");
      if (tokenInfo(suffix)) {
        tokens.unshift(suffix);
        rest = rest.slice(0, rest.length - size);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return { name: rest.join(" "), tokens };
}

function countryOnlyAirport(isos) {
  for (const iso of isos) {
    const hosts = AIRPORTS.filter((airport) => airport.countryCode === iso);
    const hub = hosts.find((airport) => airport.hub) || (hosts.length === 1 ? hosts[0] : null);
    if (hub) return hub;
    const biggest = BIGGEST_PLACE.get(iso);
    if (biggest) {
      const found = airportForPlace(biggest);
      if (found) return found.airport;
    }
  }
  return null;
}

function result(airport, confidence, reason, place = null, distanceKm = null) {
  return { airport, confidence, reason, place, distanceKm };
}

// Returns { airport, confidence, reason, place, distanceKm }. `airport` is null (confidence
// "unplaced") when nothing sensible matches: we never guess a fallback city.
export function guessAirport(row) {
  // 1. The airport column.
  const explicit = String(row.airport || row.iata || "").trim();
  if (explicit) {
    const match = airportForCode(explicit);
    if (match) return result(match, "high", "airport code");
  }

  // 2-3. Normalise, then split off the constraints: the country column and trailing parts.
  const rawLocation = String(row.location || row.city || row.place || "");
  const parts = rawLocation.split(",").map((part) => nameKey(part)).filter(Boolean);
  const fullKey = parts.join(" ");
  const countryColumn = countriesFor(row.country || "");
  const commaTokens = parts.slice(1).map((part) => tokenInfo(part)).filter(Boolean);

  const attempts = [];
  if (parts.length) {
    attempts.push({ name: parts[0], tokens: commaTokens });
    const peeled = peel(parts[0].split(" "));
    if (peeled.tokens.length) {
      attempts.push({ name: peeled.name, tokens: [...peeled.tokens.map((t) => tokenInfo(t)), ...commaTokens] });
    }
  }
  const accepts = (tokens) => (country, admin1) =>
    (!countryColumn || countryColumn.has(country)) && tokens.every((info) => satisfies(info, country, admin1));

  // 4. Aliases first ("nyc", "bay area", "silicon valley").
  const aliasHit = (key, tokens) => {
    const code = ALIASES.get(key);
    const airport = code && AIRPORTS_BY_CODE.get(code);
    if (airport && accepts(tokens)(airport.countryCode, ADMIN1_BY_AIRPORT.get(code))) return airport;
    return null;
  };
  const aliased =
    (fullKey && aliasHit(fullKey, [])) || attempts.map((attempt) => aliasHit(attempt.name, attempt.tokens)).find(Boolean);
  if (aliased) return result(aliased, "high", "known name");

  // 5. Place lookup: the full first part, then without a trailing country or region.
  const lookup = (attempt) => {
    const ok = accepts(attempt.tokens);
    const real = PLACE_INDEX.get(attempt.name) || [];
    const found = real.filter((place) => ok(place.country, place.admin1));
    for (const place of PSEUDO_INDEX.get(attempt.name) || []) {
      const duplicate = real.some((r) => r.country === place.country && (!place.admin1 || r.admin1 === place.admin1));
      if (!duplicate && ok(place.country, place.admin1)) found.push(place);
    }
    return found;
  };
  const resolveCandidates = (candidates) => {
    const sorted = [...candidates].sort((a, b) => b.population - a.population || (a.pseudo ? 1 : 0) - (b.pseudo ? 1 : 0));
    const top = sorted[0];
    const found = airportForPlace(top);
    if (!found) return result(null, "unplaced", "no match");
    let confident = sorted.length === 1;
    if (!confident) {
      const significant = sorted.filter((place) => place.population >= top.population / 10);
      confident = significant.every((place) => airportForPlace(place)?.airport === found.airport);
    }
    if (!confident) confident = top.population > 0 && top.population >= 10 * sorted[1].population;
    return finish(top, found, confident ? "high" : "medium", sorted);
  };
  const finish = (place, found, confidence, sorted) => {
    const info = placeInfo(place);
    const km = rounded(found.km);
    if (found.far) {
      return result(found.airport, "medium", `nearest major airport is ${km} km away`, info, km);
    }
    if (confidence === "medium" && sorted && sorted.length > 1) {
      const countries = new Set(sorted.map((p) => p.country));
      const where = countries.size === 1 ? ` in ${countryNameOf(place.country)}` : "";
      return result(found.airport, "medium", `${sorted.length} places called ${place.name}${where}: picked the largest`, info, km);
    }
    let reason = found.km < 10 ? "city match" : `nearest ${found.airport.size === "L" ? "major " : ""}airport, ${km} km`;
    if (found.others.length) {
      reason += `; ${found.others.slice(0, 2).join(", ")} also close`;
      confidence = "medium";
    }
    return result(found.airport, confidence, reason, info, km);
  };

  const first = attempts[0] ? lookup(attempts[0]) : [];
  if (first.length) return resolveCandidates(first);

  // 8a. The location is itself a country ("Germany", "UK").
  const ownCountry = !countryColumn && parts.length === 1 ? countriesFor(fullKey) : null;
  if (ownCountry) {
    const airport = countryOnlyAirport(ownCountry);
    if (airport) return result(airport, "medium", "country only");
  }

  const second = attempts[1] ? lookup(attempts[1]) : [];
  if (second.length) return resolveCandidates(second);

  // 5b. The whole name is a region ("Bali", "Bavaria", "California"): its largest place.
  if (PLACES_INSTALLED) {
    for (const attempt of attempts) {
      const ok = accepts(attempt.tokens);
      let top = null;
      for (const id of REGION_BY_NAME.get(attempt.name) || []) {
        const place = BIGGEST_IN_REGION.get(id);
        if (place && ok(place.country, place.admin1) && (!top || place.population > top.population)) top = place;
      }
      const found = top && airportForPlace(top);
      if (found) {
        const km = rounded(found.km);
        return result(found.airport, "medium", `region only: largest city is ${top.name}`, placeInfo(top), km);
      }
    }
  }

  // 6. Typos, only when there is no candidate at all.
  if (attempts.length && PLACES_INSTALLED) {
    const last = attempts[attempts.length - 1];
    const ok = accepts(last.tokens);
    const place = findTypo(last.name, countryColumn, (p) => ok(p.country, p.admin1));
    if (place) {
      const found = airportForPlace(place);
      if (found) {
        const info = placeInfo(place);
        const km = rounded(found.km);
        return result(found.airport, "medium", `possible typo for ${place.name}`, info, km);
      }
    }
  }

  // 8b. Only the country is known.
  if (countryColumn) {
    const airport = countryOnlyAirport(countryColumn);
    if (airport) return result(airport, "medium", "country only");
  }

  // 9. Never guess a fallback city.
  return result(null, "unplaced", "no match");
}
