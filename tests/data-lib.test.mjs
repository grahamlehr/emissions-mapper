import test from "node:test";
import assert from "node:assert/strict";
import { csvObjects, latinAlternateNames, parseCsv, splitTsv, standardOffsetHours } from "../tools/data-lib.mjs";

test("parseCsv handles quotes, commas, doubled quotes and newlines", () => {
  const rows = parseCsv('id,name,note\r\n1,"Smith, J","He said ""hi"""\r\n2,"two\nlines",\r\n3,plain,x\r\n');
  assert.deepEqual(rows, [
    ["id", "name", "note"],
    ["1", "Smith, J", 'He said "hi"'],
    ["2", "two\nlines", ""],
    ["3", "plain", "x"]
  ]);
});

test("parseCsv keeps empty fields and copes with no trailing newline", () => {
  assert.deepEqual(parseCsv('a,,c\n,"",'), [["a", "", "c"], ["", "", ""]]);
  assert.deepEqual(parseCsv(""), []);
});

test("csvObjects keys rows by the header", () => {
  assert.deepEqual(csvObjects(parseCsv("a,b\n1,2\n")), [{ a: "1", b: "2" }]);
});

test("splitTsv keeps empty columns", () => {
  assert.deepEqual(splitTsv("a\t\tc\r"), ["a", "", "c"]);
});

test("standardOffsetHours returns winter-time offsets in both hemispheres", () => {
  const expected = {
    "Europe/London": 0,
    "America/New_York": -5,
    "Australia/Sydney": 10,
    "Asia/Kolkata": 5.5,
    "Asia/Kathmandu": 5.75,
    "America/Santiago": -4,
    "Atlantic/Reykjavik": 0
  };
  for (const [zone, hours] of Object.entries(expected)) assert.equal(standardOffsetHours(zone), hours, zone);
});

test("latinAlternateNames keeps only distinct Latin names", () => {
  const kept = latinAlternateNames("München", "Munich", [
    "Munich", "Muenchen", "München", "Monaco di Baviera", "ミュンヘン", "Мюнхен", "Munchen",
    "Name 2", "x".repeat(41), "Sankt-Peter (alt.)", "O'Brien", ""
  ]);
  assert.deepEqual(kept, ["Muenchen", "Monaco di Baviera", "Sankt-Peter (alt.)", "O'Brien"]);
});

test("latinAlternateNames accepts a comma-separated string", () => {
  assert.deepEqual(latinAlternateNames("Wien", "Wien", "Vienna,Vienne,Bécs,維也納"), ["Vienna", "Vienne", "Bécs"]);
});
