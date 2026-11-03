// Pure scoring helpers for the location-matching golden set. No I/O.

export const TARGET_ACCURACY = 0.95;
export const TARGET_CONFIDENT_WRONG = 0;

export const OUTCOMES = ["correct", "overconfident", "confidentWrong", "flagged"];

/**
 * Classify one matcher result against a golden-set case.
 * result is { code: string|null, confidence: string }.
 */
export function classify(testCase, result) {
  const expect = testCase.expect ?? [];
  const code = result?.code ?? null;
  const high = result?.confidence === "high";

  if (expect.length === 0 && code === null) return "correct";

  const inExpect = code !== null && expect.includes(code);
  if (inExpect) {
    return testCase.mustFlag && high ? "overconfident" : "correct";
  }
  if (high) return "confidentWrong";
  return "flagged";
}

/** rows are { testCase, result, outcome }. */
export function summarise(rows) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  for (const row of rows) counts[row.outcome] += 1;
  const total = rows.length;
  return { ...counts, total, accuracy: total ? counts.correct / total : 0 };
}

export function meetsTarget(summary) {
  return summary.confidentWrong === TARGET_CONFIDENT_WRONG && summary.accuracy >= TARGET_ACCURACY;
}
