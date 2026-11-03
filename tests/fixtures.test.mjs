import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const url = new URL("./fixtures/locations.json", import.meta.url);

function load() {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (err) {
    assert.fail(`tests/fixtures/locations.json could not be read: ${err.message}`);
  }
}

const fixture = load();
const cases = fixture.cases;

test("fixture has at least 150 cases", () => {
  assert.ok(Array.isArray(cases), "cases must be an array");
  assert.ok(cases.length >= 150, `only ${cases.length} cases`);
});

test("ids are unique and kebab-case", () => {
  const seen = new Set();
  for (const c of cases) {
    assert.match(String(c.id), /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${c.id}`);
    assert.ok(!seen.has(c.id), `duplicate id ${c.id}`);
    seen.add(c.id);
  }
});

test("expect is an array of distinct IATA codes", () => {
  for (const c of cases) {
    assert.ok(Array.isArray(c.expect), `${c.id}: expect must be an array`);
    for (const code of c.expect) assert.match(String(code), /^[A-Z]{3}$/, `${c.id}: bad code ${code}`);
    assert.equal(new Set(c.expect).size, c.expect.length, `${c.id}: duplicate codes`);
  }
});

test("row has a location, airport or country, or is blank with nothing expected", () => {
  for (const c of cases) {
    assert.ok(c.row && typeof c.row === "object" && !Array.isArray(c.row), `${c.id}: row must be an object`);
    const filled = [c.row.location, c.row.airport, c.row.country].some((v) => typeof v === "string" && v.trim() !== "");
    if (!filled) {
      assert.equal(c.row.location, "", `${c.id}: needs a non-empty location or airport`);
      assert.equal(c.expect.length, 0, `${c.id}: blank row must expect nothing`);
    }
  }
});

test("mustFlag is boolean and only used with a non-empty expect", () => {
  for (const c of cases) {
    if (!("mustFlag" in c)) continue;
    assert.equal(typeof c.mustFlag, "boolean", `${c.id}: mustFlag must be boolean`);
    if (c.mustFlag) assert.ok(c.expect.length > 0, `${c.id}: mustFlag needs a non-empty expect`);
  }
});
