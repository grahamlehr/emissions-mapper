import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, SAMPLE_ROWS, buildGroups, findAirport, scoreAll } from "../src/model.js";

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
