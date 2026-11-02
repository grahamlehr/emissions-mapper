import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, SAMPLE_ROWS, assumptionLines, buildGroups, comparisonCsv, scoreAll } from "../src/model.js";

const HEADER =
  "Rank,City,Country,Airport,Total t CO2,Per person t CO2,Avg flight h,Avg jetlag h,Share with 6h+ jetlag %,Share in business class %";

const mk = (city, code, total, extra = {}) => ({
  destination: { city, code, country: extra.country ?? "Testland" },
  totalEmissionsKg: total,
  averageEmissionsKg: total / 10,
  averageHours: 7.26,
  jetlagScore: 3.04,
  severeJetlagShare: 0.456,
  businessShare: 0.5,
  ...extra.score
});

const lines = (csv) => csv.split("\r\n");

test("CSV has the exact header, CRLF endings and one row per city", () => {
  const scores = [mk("Bee", "BEE", 2000), mk("Ace", "ACE", 1000)];
  const csv = comparisonCsv(scores, { sortKey: "total", direction: "asc" });
  const rows = lines(csv);
  assert.equal(rows[0], HEADER);
  assert.equal(rows.length, 4, "header, two rows, trailing empty after final CRLF");
  assert.equal(rows[3], "");
  assert.ok(!csv.includes("\n") || csv.split("\n").every((part, i, all) => i === all.length - 1 || part.endsWith("\r")));
  assert.ok(!csv.startsWith("﻿"), "no BOM in the function");
});

test("rows follow the sort while rank stays by total emissions", () => {
  const scores = [mk("Bee", "BEE", 2000), mk("Ace", "ACE", 1000), mk("Cee", "CEE", 3000)];
  const byCity = lines(comparisonCsv(scores, { sortKey: "city", direction: "desc" })).slice(1, 4);
  assert.deepEqual(byCity.map((row) => row.split(",").slice(0, 2).join(",")), ["3,Cee", "2,Bee", "1,Ace"]);
  const byTotal = lines(comparisonCsv(scores, { sortKey: "total", direction: "asc" })).slice(1, 4);
  assert.deepEqual(byTotal.map((row) => row.split(",")[0]), ["1", "2", "3"]);
});

test("numbers are plain: tonnes 2 dp, hours 1 dp, whole-number percentages", () => {
  const row = lines(comparisonCsv([mk("Ace", "ACE", 1234567)]))[1];
  assert.equal(row, "1,Ace,Testland,ACE,1234.57,123.46,7.3,3.0,46,50");
});

test("fields with commas, quotes or line breaks are quoted per RFC 4180", () => {
  const csv = comparisonCsv([mk('Say "hi", city', "ACE", 1, { country: "Line\nbreak" })]);
  assert.ok(csv.includes('"Say ""hi"", city"'));
  assert.ok(csv.includes('"Line\nbreak"'));
});

test("text cells that look like formulas get a leading apostrophe", () => {
  for (const bad of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"]) {
    const csv = comparisonCsv([mk(bad, "ACE", 1)]);
    const cell = lines(csv)[1].split(",")[1];
    assert.ok(cell.replace(/^"/, "").startsWith("'"), `guarded: ${JSON.stringify(bad)}`);
  }
  assert.equal(lines(comparisonCsv([mk("Safe", "ACE", 1)]))[1].split(",")[1], "Safe");
});

test("real scores produce a row for every city", () => {
  const { groups } = buildGroups(SAMPLE_ROWS.map((row) => ({ ...row })));
  const scores = scoreAll(groups, DEFAULT_POLICY);
  const rows = lines(comparisonCsv(scores, { sortKey: "jetlag", direction: "desc" }));
  assert.equal(rows.length, scores.length + 2);
  assert.ok(rows.slice(1, -1).every((row) => row.split(",").length >= 10));
});

test("assumptionLines describes the default policy", () => {
  assert.deepEqual(assumptionLines(DEFAULT_POLICY, { placedPeople: 101, placedGroups: 6, unplacedGroups: 0 }), [
    "Return journeys",
    "Business class over 6 hours",
    "Non-CO2 uplift ×1.7",
    "Factors: DESNZ 2026",
    "Distance +8%",
    "101 people in 6 groups placed; 0 groups not placed"
  ]);
});

test("assumptionLines reflects one-way, no uplift, custom factors and singular counts", () => {
  const policy = {
    ...DEFAULT_POLICY,
    threshold: 1,
    returnTrip: false,
    nonCo2Multiplier: 1,
    factors: { ...DEFAULT_POLICY.factors, domestic: 0.2 }
  };
  const out = assumptionLines(policy, { placedPeople: 1, placedGroups: 1, unplacedGroups: 1 });
  assert.deepEqual(out, [
    "One-way journeys",
    "Business class over 1 hour",
    "Non-CO2 off",
    "Factors: custom",
    "Distance +8%",
    "1 person in 1 group placed; 1 group not placed"
  ]);
});
