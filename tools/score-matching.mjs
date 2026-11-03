// Scores the location matcher against the golden set.
// Usage: node tools/score-matching.mjs [--all] [--json] [--strict] [--fixture path]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../tests/helpers/dataset.mjs";
import { guessAirport } from "../src/model.js";
import { classify, summarise, meetsTarget, TARGET_ACCURACY } from "./scoring.mjs";

// Adapter: the only place that knows which matcher is under test.
// PR C will swap this for the new matcher.
function matchRow(row) {
  const result = guessAirport(row);
  return { code: result.airport?.code ?? null, confidence: result.confidence, reason: result.reason };
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const fixtureIndex = args.indexOf("--fixture");
const fixturePath = fixtureIndex >= 0
  ? resolve(args[fixtureIndex + 1] ?? "")
  : new URL("../tests/fixtures/locations.json", import.meta.url);

let fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
} catch (err) {
  console.error(`Could not read the fixture (${fixturePath.pathname ?? fixturePath}): ${err.message}`);
  process.exit(2);
}

const rows = fixture.cases.map((testCase) => {
  const result = matchRow(testCase.row);
  return { testCase, result, outcome: classify(testCase, result) };
});
const summary = summarise(rows);
const met = meetsTarget(summary);

if (flag("--json")) {
  console.log(JSON.stringify({ summary: { ...summary, targetMet: met }, rows }, null, 2));
} else {
  const pct = (n) => `${((n / summary.total) * 100).toFixed(1)}%`;
  console.log(`Cases: ${summary.total}`);
  for (const outcome of ["correct", "overconfident", "confidentWrong", "flagged"]) {
    console.log(`  ${outcome.padEnd(15)} ${String(summary[outcome]).padStart(4)}  ${pct(summary[outcome])}`);
  }
  console.log(`Accuracy: ${(summary.accuracy * 100).toFixed(1)}%`);
  console.log(`Target (no confident-wrong, accuracy >= ${TARGET_ACCURACY * 100}%): ${met ? "met" : "NOT met"}`);

  const show = (row) => {
    const { testCase, result } = row;
    const place = [testCase.row.location ?? testCase.row.airport ?? "", testCase.row.country].filter(Boolean).join(", ");
    const expected = testCase.expect.length ? testCase.expect.join("/") : "not placed";
    return `  ${testCase.id}: "${place}" → got ${result.code ?? "none"} (${result.confidence}, ${result.reason}); expected ${expected}`;
  };
  const section = (title, outcome) => {
    const list = rows.filter((r) => r.outcome === outcome);
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    list.forEach((r) => console.log(show(r)));
  };
  section("Confident wrong", "confidentWrong");
  section("Overconfident", "overconfident");
  if (flag("--all")) section("Flagged", "flagged");
}

if (flag("--strict") && !met) process.exit(1);
