import "./helpers/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessAirport } from "../src/model.js";

// 1,000 varied rows: the golden set's rows, cycled and with a few letters doubled or dropped on
// later laps, so the mix covers codes, aliases, places, ambiguous names, typos, country-only
// rows and junk, and later laps are not repeats of the first.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/locations.json", import.meta.url), "utf8"));
const base = fixture.cases.map((testCase) => testCase.row);
const mangle = (text, lap) => (text.length > 4 && lap % 2 ? text.slice(0, 3) + text.slice(4) : text);
const rows = [];
for (let i = 0; rows.length < 1000; i += 1) {
  const row = base[i % base.length];
  const lap = Math.floor(i / base.length);
  rows.push(lap === 0 ? row : { ...row, location: mangle(row.location || "", lap) });
}

// Generous slack: the real figures are printed, and are far below the limit.
const LIMIT_MS = 200;

test("1,000 varied rows match in under 200 ms, cold and warm", () => {
  assert.equal(rows.length, 1000);
  const time = () => {
    const start = performance.now();
    for (const row of rows) guessAirport(row);
    return performance.now() - start;
  };
  const cold = time(); // first pass: builds the lazy typo indexes and the per-place airport cache
  const warm = time();
  console.log(`1,000 rows: ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
  assert.ok(cold < LIMIT_MS, `cold pass took ${cold.toFixed(1)} ms`);
  assert.ok(warm < LIMIT_MS, `warm pass took ${warm.toFixed(1)} ms`);
});
