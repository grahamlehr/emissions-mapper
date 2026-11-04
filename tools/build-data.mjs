// Builds data/airports.json and data/places.json from the downloaded OurAirports and GeoNames
// files. Run by hand, from the repo root:
//   node tools/build-data.mjs [--raw data/raw] [--out data]
// The output is committed; the site itself has no build step. See docs/PLAN-airports.md.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";
import { csvObjects, latinAlternateNames, parseCsv, splitTsv, standardOffsetHours } from "./data-lib.mjs";
import { haversineKm, normalize } from "../src/model.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const rawDir = resolve(option("--raw", "data/raw"));
const outDir = resolve(option("--out", "data"));

const read = (name) => readFileSync(join(rawDir, name), "utf8");
const round2 = (value) => Number(Number(value).toFixed(2));
const report = [];
const say = (line = "") => report.push(line);

// ---- GeoNames places -------------------------------------------------------------------------
const places = read("cities15000.txt")
  .split("\n")
  .filter((line) => line.trim())
  .map(splitTsv)
  .map((c) => ({
    id: Number(c[0]),
    name: c[1],
    asciiname: c[2],
    alternates: c[3],
    lat: Number(c[4]),
    lon: Number(c[5]),
    country: c[8],
    admin1: c[10],
    population: Number(c[14]) || 0,
    zone: c[17]
  }));

// Unit vectors let the nearest-place search compare squared chord lengths, which is much cheaper
// than haversine and gives the same ordering.
const toVector = (lat, lon) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
for (const place of places) place.vec = toVector(place.lat, place.lon);

function nearestPlace(vec, list) {
  let best = null;
  let bestD = Infinity;
  for (const place of list) {
    const dx = place.vec[0] - vec[0];
    const dy = place.vec[1] - vec[1];
    const dz = place.vec[2] - vec[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = place;
    }
  }
  return best;
}

const placesByCountry = new Map();
for (const place of places) {
  if (!placesByCountry.has(place.country)) placesByCountry.set(place.country, []);
  placesByCountry.get(place.country).push(place);
}

// ---- Airports --------------------------------------------------------------------------------
const airportRows = csvObjects(parseCsv(read("airports.csv")));
const eligible = airportRows.filter(
  (row) =>
    row.scheduled_service === "yes" &&
    /^[A-Za-z]{3}$/.test(row.iata_code) &&
    (row.type === "large_airport" || row.type === "medium_airport")
);

const byIata = new Map();
const duplicates = [];
for (const row of eligible) {
  const iata = row.iata_code.toUpperCase();
  const existing = byIata.get(iata);
  if (!existing) {
    byIata.set(iata, row);
    continue;
  }
  const rank = (r) => (r.type === "large_airport" ? 0 : 1);
  const keep = rank(row) < rank(existing) ? row : existing;
  const drop = keep === row ? existing : row;
  byIata.set(iata, keep);
  duplicates.push(`${iata}: kept ${keep.ident} (${keep.type}), dropped ${drop.ident} (${drop.type})`);
}

const timeZoneCache = new Map();
const zoneOffset = (zone) => {
  if (!timeZoneCache.has(zone)) timeZoneCache.set(zone, standardOffsetHours(zone));
  return timeZoneCache.get(zone);
};

let fallbackCount = 0;
let fallbackMaxKm = 0;
let sameCountryMaxKm = 0;
const airports = [...byIata.keys()].sort().map((iata) => {
  const row = byIata.get(iata);
  const lat = Number(row.latitude_deg);
  const lon = Number(row.longitude_deg);
  const vec = toVector(lat, lon);
  let place = nearestPlace(vec, placesByCountry.get(row.iso_country) || []);
  let km = place ? haversineKm({ lat, lon }, place) : Infinity;
  if (!place || km > 300) {
    place = nearestPlace(vec, places);
    km = haversineKm({ lat, lon }, place);
    fallbackCount += 1;
    fallbackMaxKm = Math.max(fallbackMaxKm, km);
  } else {
    sameCountryMaxKm = Math.max(sameCountryMaxKm, km);
  }
  const icao = row.icao_code || (/^[A-Za-z0-9]{4}$/.test(row.gps_code) && /[A-Za-z]{4}/.test(row.gps_code) ? row.gps_code : "");
  return [
    iata,
    icao,
    row.name,
    row.municipality,
    row.iso_country,
    row.iso_region,
    round2(lat),
    round2(lon),
    row.type === "large_airport" ? "L" : "M",
    zoneOffset(place.zone)
  ];
});
const airportFields = ["iata", "icao", "name", "municipality", "country", "region", "lat", "lon", "size", "tz"];

// ---- Countries -------------------------------------------------------------------------------
const countryInfo = read("countryInfo.txt")
  .split("\n")
  .filter((line) => line.trim() && !line.startsWith("#"))
  .map(splitTsv);
const keywordsByCode = new Map(
  csvObjects(parseCsv(read("countries.csv"))).map((row) => [
    row.code,
    row.keywords.split(",").map((k) => k.trim()).filter(Boolean)
  ])
);
const countries = countryInfo
  .map((c) => [c[0], c[1], c[4], keywordsByCode.get(c[0]) || []])
  .sort((a, b) => a[0].localeCompare(b[0]));
const countryFields = ["iso2", "iso3", "name", "keywords"];

// ---- Regions ---------------------------------------------------------------------------------
const ourRegions = csvObjects(parseCsv(read("regions.csv")));
const abbrByCountryName = new Map();
for (const row of ourRegions) {
  if (!/^[A-Za-z]{1,3}$/.test(row.local_code)) continue;
  const key = `${row.iso_country}|${normalize(row.name)}`;
  if (!abbrByCountryName.has(key)) abbrByCountryName.set(key, row.local_code.toUpperCase());
}
const regions = read("admin1CodesASCII.txt")
  .split("\n")
  .filter((line) => line.trim())
  .map(splitTsv)
  .map((c) => {
    const [country, admin1] = c[0].split(".");
    const abbr = abbrByCountryName.get(`${country}|${normalize(c[1])}`) || abbrByCountryName.get(`${country}|${normalize(c[2])}`) || "";
    return [country, admin1, c[1], abbr];
  })
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
const regionFields = ["country", "admin1", "name", "abbr"];

// ---- Places output ---------------------------------------------------------------------------
// Alternate names (exonyms such as München, Lisboa or Bombay) are kept only for bigger places,
// where people actually use them; for small towns they are mostly romanisations and cost a lot
// of space. An ASCII name identical to the name is left blank to save space.
const ALTERNATES_MIN_POPULATION = 100000;
const placeRows = places.map((p) => [
  p.name,
  p.asciiname === p.name ? "" : p.asciiname,
  p.population >= ALTERNATES_MIN_POPULATION ? latinAlternateNames(p.name, p.asciiname, p.alternates).join("|") : "",
  p.country,
  p.admin1,
  round2(p.lat),
  round2(p.lon),
  p.population
]);
const placeFields = ["name", "asciiname", "alternates", "country", "admin1", "lat", "lon", "population"];

// ---- Write -----------------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
const table = (fields, rows) => ({ fields, rows });
const outputs = {
  "airports.json": {
    airports: table(airportFields, airports),
    countries: table(countryFields, countries),
    regions: table(regionFields, regions)
  },
  "places.json": { places: table(placeFields, placeRows) }
};
const sizes = {};
for (const [file, content] of Object.entries(outputs)) {
  const json = JSON.stringify(content);
  writeFileSync(join(outDir, file), json);
  sizes[file] = { raw: Buffer.byteLength(json), gzip: gzipSync(json, { level: 9 }).length };
}

// ---- Report ----------------------------------------------------------------------------------
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
say(`Airports: ${airports.length} (of ${airportRows.length} OurAirports rows; ${eligible.length} eligible before de-duplication)`);
say(`  large ${airports.filter((a) => a[8] === "L").length}, medium ${airports.filter((a) => a[8] === "M").length}`);
say(`  duplicate IATA codes: ${duplicates.length}${duplicates.length ? "\n    " + duplicates.join("\n    ") : ""}`);
say(`  no ICAO code: ${airports.filter((a) => !a[1]).length}`);
say(`  time zone: nearest same-country place, max ${sameCountryMaxKm.toFixed(0)} km`);
say(`  time zone fallbacks (no same-country place within 300 km): ${fallbackCount}, max distance used ${fallbackMaxKm.toFixed(0)} km`);
say(`Countries: ${countries.length}, with ${countries.reduce((n, c) => n + c[3].length, 0)} extra names`);
say(`Regions: ${regions.length}, with an abbreviation: ${regions.filter((r) => r[3]).length}`);
for (const code of ["US", "CA", "AU", "GB"]) {
  const list = regions.filter((r) => r[0] === code);
  const missing = list.filter((r) => !r[3]).map((r) => r[2]);
  say(`  ${code}: ${list.length - missing.length} of ${list.length} have an abbreviation${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
}
say(`Places: ${placeRows.length} (cities15000 rows read: ${places.length})`);
const withAlternates = placeRows.filter((r) => r[2]).length;
const altBytes = placeRows.reduce((n, r) => n + Buffer.byteLength(r[2]), 0);
say(`  with Latin alternate names: ${withAlternates}; alternates take about ${kb(altBytes)} of the raw file`);
say("Files:");
for (const [file, { raw, gzip }] of Object.entries(sizes)) say(`  ${file}: ${kb(raw)} raw, ${kb(gzip)} gzipped`);
const totalRaw = Object.values(sizes).reduce((n, s) => n + s.raw, 0);
const totalGzip = Object.values(sizes).reduce((n, s) => n + s.gzip, 0);
say(`  total: ${kb(totalRaw)} raw, ${kb(totalGzip)} gzipped (budget: places.json under about 900 KB gzipped)`);
if (sizes["places.json"].gzip > 900 * 1024) {
  const share = (i) => placeRows.reduce((n, r) => n + Buffer.byteLength(String(r[i])), 0);
  say(`  places.json is over 900 KB gzipped. Text by column: name ${kb(share(0))}, asciiname ${kb(share(1))}, alternates ${kb(share(2))}, admin1 ${kb(share(4))}`);
}
console.log(report.join("\n"));
