import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRPORTS,
  buildGroups,
  canonicalCountry,
  emissionsForLeg,
  guessAirport,
  parseCsv,
  parsePeople,
  scoreAll,
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
  const policy = { threshold: 6, economyFactor: 0.1, businessMultiplier: 2, nonCo2Multiplier: 1 };
  const oneWay = emissionsForLeg(1000, 2, 10, { ...policy, returnTrip: false });
  const twoWay = emissionsForLeg(1000, 2, 10, { ...policy, returnTrip: true });
  assert.equal(oneWay, 1000);
  assert.equal(twoWay, 2 * oneWay);
});

test("unplaced groups are excluded from totals", () => {
  const policy = { threshold: 6, economyFactor: 0.115, businessMultiplier: 2.8, nonCo2Multiplier: 1, returnTrip: true };
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
