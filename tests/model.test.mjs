import "./helpers/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRPORTS,
  buildGroups,
  DEFAULT_POLICY,
  DESNZ_2026,
  canonicalCountry,
  emissionsForLeg,
  guessAirport,
  haulFor,
  haversineKm,
  flightHours,
  parseCsv,
  parsePeople,
  scoreAll,
  scoreDestination,
  sortScores,
  airportByCode,
  tzDifference
} from "../src/model.js";

const code = (row) => guessAirport(row).airport?.code ?? null;

test("airport list is consistent", () => {
  const codes = AIRPORTS.map((airport) => airport.code);
  assert.equal(new Set(codes).size, codes.length, "codes are unique");
  assert.ok(AIRPORTS.length >= 85);
  const byCountry = Map.groupBy(AIRPORTS, (airport) => airport.country);
  for (const [country, list] of byCountry) {
    const hubs = list.filter((airport) => airport.hub).length;
    if (list.length > 1) assert.equal(hubs, 1, `${country} needs exactly one hub`);
  }
});

test("Jerome, United States is not Rome", () => {
  const guess = guessAirport({ location: "Jerome", country: "United States" });
  assert.equal(guess.airport.code, "JFK");
  assert.equal(guess.confidence, "medium");
});

test("London, Canada falls back to the Canadian hub", () => {
  const guess = guessAirport({ location: "London", country: "Canada" });
  assert.equal(guess.airport.code, "YYZ");
  assert.equal(guess.confidence, "medium");
});

test("country can be spotted inside the location text", () => {
  assert.equal(code({ location: "London, Canada" }), "YYZ");
  assert.equal(code({ location: "Seattle, United States" }), "SEA");
});

test("Leeds, U.K. uses the UK hub", () => {
  const guess = guessAirport({ location: "Leeds", country: "U.K." });
  assert.equal(guess.airport.code, "LHR");
  assert.equal(guess.confidence, "medium");
  assert.equal(canonicalCountry("U.S.A."), "United States");
});

test("Warsaw, Seattle and San Francisco match with high confidence", () => {
  for (const [row, expected] of [
    [{ location: "Warsaw", country: "Poland" }, "WAW"],
    [{ location: "Seattle", country: "U.S." }, "SEA"],
    [{ location: "San Francisco", country: "USA" }, "SFO"]
  ]) {
    const guess = guessAirport(row);
    assert.equal(guess.airport.code, expected);
    assert.equal(guess.confidence, "high");
  }
});

test("aliases and longest name win", () => {
  assert.equal(code({ location: "Washington DC", country: "USA" }), "IAD");
  assert.equal(code({ location: "Saigon" }), "SGN");
  assert.equal(code({ location: "Bangalore, India" }), "BLR");
  assert.equal(code({ location: "Panama City" }), "PTY");
});

test("unknown places are unplaced, with no London fallback", () => {
  const guess = guessAirport({ location: "Atlantis" });
  assert.equal(guess.airport, null);
  assert.equal(guess.confidence, "unplaced");
});

test("explicit airport code wins", () => {
  assert.equal(code({ location: "London", country: "United Kingdom", airport: "mxp" }), "MXP");
});

test("parsePeople handles separators and rejects junk", () => {
  assert.equal(parsePeople("1,200"), 1200);
  assert.equal(parsePeople("1 200"), 1200);
  assert.equal(parsePeople("1'200"), 1200);
  assert.equal(parsePeople(42), 42);
  assert.equal(parsePeople("1.200"), 1200);
  assert.ok(Number.isNaN(parsePeople("1.5")));
  assert.ok(Number.isNaN(parsePeople(2.5)));
  assert.ok(Number.isNaN(parsePeople("1.2.3")));
  assert.ok(Number.isNaN(parsePeople("many")));
  assert.ok(Number.isNaN(parsePeople("")));
  assert.ok(Number.isNaN(parsePeople(undefined)));
});

test("parseCsv detects semicolons", () => {
  const rows = parseCsv("location;country;people\nParis;France;12\nLyon;France;3");
  assert.deepEqual(rows[0], { location: "Paris", country: "France", people: "12", airport: undefined });
  assert.equal(rows.length, 2);
});

test("parseCsv detects tabs", () => {
  const rows = parseCsv("location\tcountry\tpeople\nParis\tFrance\t12");
  assert.equal(rows[0].people, "12");
});

test("parseCsv handles quoted delimiters, doubled quotes and newlines", () => {
  const text = 'location,country,people\n"Paris, ""Ile""",France,"1,200"\n"Line\nbreak",Spain,3\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].location, 'Paris, "Ile"');
  assert.equal(rows[0].people, "1,200");
  assert.equal(rows[1].location, "Line\nbreak");
  assert.equal(rows[1].country, "Spain");
});

test("parseCsv strips a BOM and skips blank lines", () => {
  const rows = parseCsv("﻿location,country,people\r\n\r\nParis,France,2\r\n\r\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, "Paris");
});

test("buildGroups counts skipped rows but not blank ones", () => {
  const { groups, skipped } = buildGroups([
    { location: "Paris", country: "France", people: "1,200" },
    { location: "Berlin", country: "Germany", people: "lots" },
    { location: "Rome", country: "Italy", people: 0 },
    { location: "", country: "", people: "" },
    { location: "Atlantis", people: 4 }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].people, 1200);
  assert.equal(skipped, 2);
  assert.equal(groups[1].airportCode, null);
  assert.equal(groups[1].confidence, "unplaced");
});

test("return trips double the one-way figure", () => {
  const policy = { ...DEFAULT_POLICY, nonCo2Multiplier: 1 };
  const oneWay = emissionsForLeg(1000, 2, 10, { ...policy, returnTrip: false });
  const twoWay = emissionsForLeg(1000, 2, 10, { ...policy, returnTrip: true });
  assert.ok(Math.abs(oneWay - 1000 * 1.08 * 10 * 0.068) < 1e-9);
  assert.equal(twoWay, 2 * oneWay);
  assert.equal(emissionsForLeg(1000, 2, 10, { ...policy, returnTrip: undefined }), twoWay);
});

test("haulFor splits domestic, short-haul and long-haul by distance", () => {
  assert.equal(haulFor(0), "domestic");
  assert.equal(haulFor(499), "domestic");
  assert.equal(haulFor(500), "shortHaul");
  assert.equal(haulFor(3699), "shortHaul");
  assert.equal(haulFor(3700), "longHaul");
  assert.equal(haulFor(15000), "longHaul");
});

test("DESNZ 2026 defaults are the published figures", () => {
  assert.equal(DESNZ_2026.nonCo2Multiplier, 1.7);
  assert.equal(DESNZ_2026.distanceUplift, 1.08);
  assert.deepEqual(DEFAULT_POLICY.factors, DESNZ_2026.factorsKgPerPkm);
  assert.equal(DEFAULT_POLICY.nonCo2Multiplier, 1.7);
  assert.notEqual(DEFAULT_POLICY.factors.shortHaul, DESNZ_2026.factorsKgPerPkm.shortHaul);
});

test("emissionsForLeg picks the right factor for each flight type and cabin", () => {
  const f = DESNZ_2026.factorsKgPerPkm;
  const p = { ...DEFAULT_POLICY, nonCo2Multiplier: 1, returnTrip: false };
  const run = (km, hours) => emissionsForLeg(km, hours, 1, p) / (km * 1.08);
  // Domestic ignores the cabin, even above the threshold.
  assert.equal(run(300, 1), f.domestic);
  assert.equal(run(300, 9), f.domestic);
  assert.equal(run(2000, 3), f.shortHaul.economy);
  assert.equal(run(2000, 7), f.shortHaul.business);
  assert.equal(run(8000, 6), f.longHaul.economy); // exactly on the threshold stays economy
  assert.equal(run(8000, 6.01), f.longHaul.business);
});

test("distance uplift, non-CO2 multiplier and people all scale the result", () => {
  const base = { ...DEFAULT_POLICY, nonCo2Multiplier: 1, distanceUplift: 1, returnTrip: false };
  const one = emissionsForLeg(2000, 3, 1, base);
  assert.ok(Math.abs(emissionsForLeg(2000, 3, 1, { ...base, distanceUplift: 1.08 }) - one * 1.08) < 1e-9);
  assert.ok(Math.abs(emissionsForLeg(2000, 3, 1, { ...base, nonCo2Multiplier: 1.7 }) - one * 1.7) < 1e-9);
  assert.ok(Math.abs(emissionsForLeg(2000, 3, 25, base) - one * 25) < 1e-9);
});

test("worked example: London to New York, economy, one way, no non-CO2 uplift", () => {
  const gcd = haversineKm(airportByCode("LHR"), airportByCode("JFK"));
  assert.ok(gcd > 5400 && gcd < 5700);
  const policy = { ...DEFAULT_POLICY, nonCo2Multiplier: 1, returnTrip: false, threshold: 14 };
  const kg = emissionsForLeg(gcd, flightHours(gcd), 1, policy);
  assert.ok(Math.abs(kg - gcd * 1.08 * 0.0632) < 1e-9);
});

test("unplaced groups are excluded from totals", () => {
  const policy = { ...DEFAULT_POLICY, nonCo2Multiplier: 1 };
  const placed = [{ people: 10, airportCode: "LHR" }];
  const withUnplaced = [...placed, { people: 500, airportCode: null }];
  const a = scoreAll(placed, policy);
  const b = scoreAll(withUnplaced, policy);
  assert.deepEqual(
    b.map((s) => [s.destination.code, s.totalEmissionsKg, s.totalPeople]),
    a.map((s) => [s.destination.code, s.totalEmissionsKg, s.totalPeople])
  );
  assert.equal(b[0].totalPeople, 10);
  assert.ok(scoreAll([{ people: 5, airportCode: null }], policy).every((s) => s.totalPeople === 0));
});

test("tzDifference wraps around the date line", () => {
  assert.equal(tzDifference(12, -11), 1);
  assert.equal(tzDifference(-5, 5.5), 10.5);
  assert.equal(tzDifference(0, 0), 0);
});

const POLICY = { ...DEFAULT_POLICY, nonCo2Multiplier: 1 };

test("scoreDestination reports severe jetlag and business class shares", () => {
  // To London: Delhi is a 5.5 h shift (not severe), Sydney 10 h (severe). Both fly over 6 h.
  const groups = [
    { people: 10, airportCode: "DEL" },
    { people: 30, airportCode: "SYD" },
    { people: 60, airportCode: "LHR" },
    { people: 99, airportCode: null }
  ];
  const london = scoreDestination(airportByCode("LHR"), groups, POLICY);
  assert.equal(london.totalPeople, 100);
  assert.equal(london.severeJetlagShare, 0.3);
  assert.equal(london.businessShare, london.businessClassPeople / 100);
  assert.equal(london.businessClassPeople, 40);
  const empty = scoreDestination(airportByCode("LHR"), [], POLICY);
  assert.equal(empty.severeJetlagShare, 0);
  assert.equal(empty.businessShare, 0);
  assert.equal(scoreDestination(airportByCode("SYD"), groups, POLICY).severeJetlagShare, 0.6); // London is 10 h from Sydney
});

test("sortScores sorts by each key without mutating the input", () => {
  const scores = scoreAll(
    [{ people: 10, airportCode: "LHR" }, { people: 5, airportCode: "SYD" }, { people: 8, airportCode: "JFK" }],
    POLICY
  );
  const before = scores.map((s) => s.destination.code);
  const keys = {
    total: "totalEmissionsKg",
    perPerson: "averageEmissionsKg",
    hours: "averageHours",
    jetlag: "jetlagScore",
    severeJetlag: "severeJetlagShare",
    business: "businessShare"
  };
  for (const [key, field] of Object.entries(keys)) {
    const asc = sortScores(scores, key, "asc").map((s) => s[field]);
    const desc = sortScores(scores, key, "desc").map((s) => s[field]);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b), `${key} asc`);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a), `${key} desc`);
  }
  const cities = sortScores(scores, "city", "asc").map((s) => s.destination.city);
  assert.deepEqual(cities, [...cities].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(sortScores(scores, "city", "desc").map((s) => s.destination.city), cities.toReversed());
  assert.deepEqual(scores.map((s) => s.destination.code), before);
});

test("sortScores breaks ties by total emissions then city", () => {
  const mk = (city, total, jetlagScore) => ({ destination: { city }, totalEmissionsKg: total, jetlagScore });
  const scores = [mk("Zed", 5, 1), mk("Bee", 9, 1), mk("Ace", 5, 1), mk("Low", 1, 1)];
  assert.deepEqual(sortScores(scores, "jetlag", "asc").map((s) => s.destination.city), ["Low", "Ace", "Zed", "Bee"]);
  assert.deepEqual(sortScores(scores, "jetlag", "desc").map((s) => s.destination.city), ["Low", "Ace", "Zed", "Bee"]);
});
