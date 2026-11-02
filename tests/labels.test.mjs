import test from "node:test";
import assert from "node:assert/strict";
import { inflateRect, panPadding, pickVisibleLabels, rectsOverlap } from "../src/labels.js";

const box = (left, top, width = 20, height = 10) => ({ left, top, right: left + width, bottom: top + height });

test("rectsOverlap detects overlap but not touching edges", () => {
  assert.equal(rectsOverlap(box(0, 0), box(10, 5)), true);
  assert.equal(rectsOverlap(box(0, 0), box(20, 0)), false);
  assert.equal(rectsOverlap(box(0, 0), box(0, 10)), false);
  assert.equal(rectsOverlap(box(0, 0), box(100, 100)), false);
});

test("inflateRect grows every side", () => {
  assert.deepEqual(inflateRect(box(10, 10), 2), { left: 8, top: 8, right: 32, bottom: 22 });
});

test("pickVisibleLabels keeps the higher priority of two overlapping labels", () => {
  const kept = pickVisibleLabels([
    { id: "low", rect: box(0, 0), priority: 5 },
    { id: "high", rect: box(5, 2), priority: 1 }
  ]);
  assert.deepEqual([...kept], ["high"]);
});

test("pickVisibleLabels keeps non-overlapping labels and is order independent", () => {
  const items = [
    { id: "a", rect: box(0, 0), priority: 2 },
    { id: "b", rect: box(50, 0), priority: 1 },
    { id: "c", rect: box(10, 3), priority: 3 }
  ];
  assert.deepEqual([...pickVisibleLabels(items)].sort(), ["a", "b"]);
  assert.deepEqual([...pickVisibleLabels([...items].reverse())].sort(), ["a", "b"]);
});

test("pickVisibleLabels: a hidden label does not block later ones", () => {
  const kept = pickVisibleLabels([
    { id: "a", rect: box(0, 0), priority: 1 },
    { id: "b", rect: box(15, 0), priority: 2 },
    { id: "c", rect: box(30, 0), priority: 3 }
  ]);
  assert.deepEqual([...kept].sort(), ["a", "c"]);
});

test("pickVisibleLabels honours the margin", () => {
  const items = [
    { id: "a", rect: box(0, 0), priority: 1 },
    { id: "b", rect: box(21, 0), priority: 2 }
  ];
  assert.equal(pickVisibleLabels(items).size, 2);
  assert.equal(pickVisibleLabels(items, { margin: 2 }).size, 1);
});

test("pickVisibleLabels breaks ties by input order and handles empty input", () => {
  const kept = pickVisibleLabels([
    { id: "first", rect: box(0, 0), priority: 1 },
    { id: "second", rect: box(0, 0), priority: 1 }
  ]);
  assert.deepEqual([...kept], ["first"]);
  assert.equal(pickVisibleLabels([]).size, 0);
});

test("panPadding clears a card in the bottom-right corner", () => {
  const container = { left: 0, top: 0, right: 1000, bottom: 700 };
  const card = { left: 600, top: 400, right: 976, bottom: 676 };
  const padding = panPadding(container, card);
  assert.deepEqual(padding.bottomRight, [424, 324]);
  assert.deepEqual(padding.topLeft, [40, 40]);
});

test("panPadding falls back to uniform padding when the card is elsewhere", () => {
  const container = { left: 0, top: 0, right: 500, bottom: 400 };
  const card = { left: 0, top: 420, right: 500, bottom: 600 };
  assert.deepEqual(panPadding(container, card), { topLeft: [40, 40], bottomRight: [40, 40] });
  assert.deepEqual(panPadding(container, null), { topLeft: [40, 40], bottomRight: [40, 40] });
});
