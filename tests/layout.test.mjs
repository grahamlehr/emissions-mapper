import test from "node:test";
import assert from "node:assert/strict";
import { exportTableRows, fitRect, tableRowHeight, truncateText, wrapText } from "../src/layout.js";

const measure = (text) => text.length * 10;

test("fitRect keeps the aspect ratio and centres horizontally", () => {
  const wide = fitRect(1000, 500, { x: 40, y: 100, width: 400, height: 400 });
  assert.deepEqual(wide, { x: 40, y: 100, width: 400, height: 200, scale: 0.4 });
  const tall = fitRect(500, 1000, { x: 0, y: 0, width: 400, height: 400 });
  assert.equal(tall.height, 400);
  assert.equal(tall.width, 200);
  assert.equal(tall.x, 100);
});

test("fitRect copes with an empty source", () => {
  assert.equal(fitRect(0, 0, { x: 5, y: 6, width: 100, height: 100 }).scale, 0);
});

test("wrapText breaks at spaces and never exceeds the width", () => {
  const lines = wrapText("one two three four five", 90, measure);
  assert.deepEqual(lines, ["one two", "three", "four five"]);
  for (const line of lines) assert.ok(measure(line) <= 90);
});

test("wrapText keeps an over-long word whole and handles empty text", () => {
  assert.deepEqual(wrapText("supercalifragilistic a", 50, measure), ["supercalifragilistic", "a"]);
  assert.deepEqual(wrapText("   ", 50, measure), []);
});

test("wrapText ends the last line with an ellipsis when maxLines is exceeded", () => {
  const lines = wrapText("one two three four five six", 90, measure, { maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "one two");
  assert.ok(lines[1].endsWith("…"));
  assert.ok(measure(lines[1]) <= 90);
});

test("truncateText only changes text that does not fit", () => {
  assert.equal(truncateText("short", 100, measure), "short");
  const out = truncateText("a very long city name", 100, measure);
  assert.ok(out.endsWith("…"));
  assert.ok(measure(out) <= 100);
});

const scores = Array.from({ length: 15 }, (_, i) => ({ destination: { code: `C${i}` } }));

test("exportTableRows takes the top ten with ranks and marks the selected row", () => {
  const rows = exportTableRows(scores, "C2");
  assert.equal(rows.length, 10);
  assert.equal(rows[0].rank, 1);
  assert.deepEqual(rows.filter((row) => row.selected).map((row) => row.rank), [3]);
});

test("exportTableRows appends a selected city that ranks below the top ten", () => {
  const rows = exportTableRows(scores, "C12");
  assert.equal(rows.length, 11);
  assert.equal(rows[10].rank, 13);
  assert.ok(rows[10].selected && rows[10].separated);
});

test("exportTableRows copes with fewer cities than the limit", () => {
  assert.equal(exportTableRows(scores.slice(0, 3), "C1").length, 3);
  assert.deepEqual(exportTableRows([], "X"), []);
});

test("tableRowHeight is capped and shrinks to fit", () => {
  assert.equal(tableRowHeight(700, 10), 56);
  assert.equal(tableRowHeight(400, 11), 35);
});
