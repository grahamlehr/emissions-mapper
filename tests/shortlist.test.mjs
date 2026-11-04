import "./helpers/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRPORTS,
  DEFAULT_POLICY,
  SAMPLE_ROWS,
  airportByCode,
  airportChoices,
  airportLabel,
  allAirports,
  buildGroups,
  destinationCodes,
  findAirport,
  resolveAirportInput,
  reviewDetail,
  scoreAll
} from "../src/model.js";

test("findAirport matches IATA codes, whatever the case or spacing", () => {
  assert.equal(findAirport("LIS").code, "LIS");
  assert.equal(findAirport("lis").code, "LIS");
  assert.equal(findAirport("  Lis ").code, "LIS");
});

test("findAirport matches cities, aliases and City, Country", () => {
  assert.equal(findAirport("Paris").city, "Paris");
  assert.equal(findAirport("New York").country, "United States");
  assert.equal(findAirport("Lisbon, Portugal").code, "LIS");
});

test("findAirport rejects country-only, nonsense and empty input", () => {
  assert.equal(findAirport("France"), null);
  assert.equal(findAirport("zzzz qqqq"), null);
  assert.equal(findAirport(""), null);
  assert.equal(findAirport("   "), null);
  assert.equal(findAirport(undefined), null);
});

test("scoreAll with codes scores only those airports, lowest first", () => {
  const { groups } = buildGroups(SAMPLE_ROWS.map((row) => ({ ...row })));
  const all = scoreAll(groups, DEFAULT_POLICY);
  const some = scoreAll(groups, DEFAULT_POLICY, ["LIS", "AMS", "JFK"]);
  assert.deepEqual(some.map((s) => s.destination.code).sort(), ["AMS", "JFK", "LIS"]);
  for (let i = 1; i < some.length; i += 1) {
    assert.ok(some[i - 1].totalEmissionsKg <= some[i].totalEmissionsKg);
  }
  const fromAll = all.find((s) => s.destination.code === "LIS");
  assert.equal(some.find((s) => s.destination.code === "LIS").totalEmissionsKg, fromAll.totalEmissionsKg);
});

test("scoreAll accepts a Set and ignores an empty list", () => {
  const { groups } = buildGroups(SAMPLE_ROWS.map((row) => ({ ...row })));
  assert.equal(scoreAll(groups, DEFAULT_POLICY, new Set(["AMS"])).length, 1);
  assert.equal(scoreAll(groups, DEFAULT_POLICY, []).length, scoreAll(groups, DEFAULT_POLICY).length);
});

test("findAirport finds non-host cities and codes", () => {
  assert.equal(findAirport("Bilbao").code, "BIO");
  assert.equal(findAirport("BIO").code, "BIO");
});

test("scoreAll scores any airport code, host or not", () => {
  const { groups } = buildGroups(SAMPLE_ROWS.map((row) => ({ ...row })));
  const scores = scoreAll(groups, DEFAULT_POLICY, ["BIO", "AMS", "NOPE"]);
  assert.deepEqual(scores.map((s) => s.destination.code).sort(), ["AMS", "BIO"]);
  assert.ok(scores.find((s) => s.destination.code === "BIO").totalEmissionsKg > 0);
});

test("destinationCodes: filter on ranks exactly the shortlist; off adds it to the hosts", () => {
  const { groups } = buildGroups(SAMPLE_ROWS.map((row) => ({ ...row })));
  assert.deepEqual(destinationCodes(["BIO", "OPO"], true), ["BIO", "OPO"]);
  const off = destinationCodes(["BIO", "AMS"], false);
  const hostHasBio = AIRPORTS.some((a) => a.code === "BIO");
  assert.equal(off.length, AIRPORTS.length + (hostHasBio ? 0 : 1));
  assert.ok(off.includes("BIO"));
  assert.equal(destinationCodes([], true).length, AIRPORTS.length);
  assert.equal(scoreAll(groups, DEFAULT_POLICY, off).length, off.length);
});

test("airportLabel and airportChoices", () => {
  const bio = airportByCode("BIO");
  assert.match(airportLabel(bio), /^Bilbao, Spain .*\(BIO\)$/);
  assert.equal(airportLabel({ city: "Foo", name: "Foo Airport", country: "Bar", code: "FOO" }), "Foo, Bar (FOO)");
  assert.equal(airportLabel({ city: "Foo", name: "Foo International Airport", country: "Bar", code: "FOO" }), "Foo, Bar (FOO)");
  const choices = airportChoices();
  assert.equal(choices.length, allAirports().length);
  assert.equal(new Set(choices.map((c) => c.label)).size, choices.length);
  for (let i = 1; i < choices.length; i += 1) {
    const [a, b] = [choices[i - 1].airport, choices[i].airport];
    assert.ok(a.city.localeCompare(b.city) < 0 || (a.city === b.city && a.code < b.code));
  }
});

test("resolveAirportInput resolves trailing codes, exact labels and free text", () => {
  const choices = airportChoices();
  assert.equal(resolveAirportInput(airportLabel(airportByCode("BIO")), choices).code, "BIO");
  assert.equal(resolveAirportInput("something (opo)", choices).code, "OPO");
  assert.equal(resolveAirportInput("Bilbao", choices).code, "BIO");
  assert.equal(resolveAirportInput("zzzz qqqq", choices), null);
  assert.equal(resolveAirportInput("  ", choices), null);
});

test("reviewDetail adds the distance only when the reason lacks it", () => {
  const base = { inputLocation: "Leiden", airportCode: "AMS" };
  assert.equal(reviewDetail({ ...base, reason: "nearest major airport, 25 km", distanceKm: 25 }), "nearest major airport, 25 km");
  assert.equal(reviewDetail({ ...base, reason: "chosen by you", distanceKm: null }), "chosen by you");
  assert.equal(reviewDetail({ ...base, reason: "city match", distanceKm: 12 }), "city match · airport 12 km away");
  assert.equal(reviewDetail({ ...base, reason: "city match", place: { name: "Leiden" } }), "city match");
  assert.equal(
    reviewDetail({ inputLocation: "NYC", airportCode: "JFK", reason: "city match", place: { name: "New York City" } }),
    "NYC \u2192 New York City \u00b7 city match"
  );
});
