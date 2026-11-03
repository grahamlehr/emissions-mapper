import test from "node:test";
import assert from "node:assert/strict";
import { classify, summarise, meetsTarget } from "../tools/scoring.mjs";

const plain = { id: "a", expect: ["PDX"] };
const ambiguous = { id: "b", expect: ["SGF", "SPI"], mustFlag: true };
const none = { id: "c", expect: [] };

test("classify: expect empty and unplaced is correct", () => {
  assert.equal(classify(none, { code: null, confidence: "unplaced" }), "correct");
});

test("classify: expect empty but a high-confidence code is confidentWrong", () => {
  assert.equal(classify(none, { code: "LHR", confidence: "high" }), "confidentWrong");
});

test("classify: expect empty but a low-confidence code is flagged", () => {
  assert.equal(classify(none, { code: "LHR", confidence: "medium" }), "flagged");
});

test("classify: code in expect is correct at any confidence", () => {
  assert.equal(classify(plain, { code: "PDX", confidence: "high" }), "correct");
  assert.equal(classify(plain, { code: "PDX", confidence: "medium" }), "correct");
});

test("classify: mustFlag with a right answer at medium is correct", () => {
  assert.equal(classify(ambiguous, { code: "SPI", confidence: "medium" }), "correct");
});

test("classify: mustFlag with a right answer at high is overconfident", () => {
  assert.equal(classify(ambiguous, { code: "SGF", confidence: "high" }), "overconfident");
});

test("classify: wrong code at high is confidentWrong", () => {
  assert.equal(classify(plain, { code: "PWM", confidence: "high" }), "confidentWrong");
  assert.equal(classify(ambiguous, { code: "BDL", confidence: "high" }), "confidentWrong");
});

test("classify: wrong code or unplaced at lower confidence is flagged", () => {
  assert.equal(classify(plain, { code: "PWM", confidence: "medium" }), "flagged");
  assert.equal(classify(plain, { code: null, confidence: "unplaced" }), "flagged");
});

test("summarise counts outcomes and accuracy", () => {
  const rows = ["correct", "correct", "flagged", "overconfident"].map((outcome) => ({ testCase: {}, result: {}, outcome }));
  const s = summarise(rows);
  assert.equal(s.total, 4);
  assert.equal(s.correct, 2);
  assert.equal(s.flagged, 1);
  assert.equal(s.overconfident, 1);
  assert.equal(s.confidentWrong, 0);
  assert.equal(s.accuracy, 0.5);
});

test("summarise copes with no rows", () => {
  assert.equal(summarise([]).accuracy, 0);
});

test("meetsTarget needs zero confidentWrong and accuracy of at least 95%", () => {
  assert.equal(meetsTarget({ confidentWrong: 0, accuracy: 0.95 }), true);
  assert.equal(meetsTarget({ confidentWrong: 0, accuracy: 0.949 }), false);
  assert.equal(meetsTarget({ confidentWrong: 1, accuracy: 1 }), false);
});
