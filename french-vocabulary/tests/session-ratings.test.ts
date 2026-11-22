import test from "node:test";
import assert from "node:assert/strict";
import { sessionRatingLabels, SessionResult } from "../src/core/copy-session";

test("session ratings use question identity rather than queue positions", () => {
  const results: SessionResult[] = [
    { questionId: "a:meaning", rating: 1, correct: false },
    { questionId: "c:meaning", rating: 2, correct: true },
    { questionId: "d:meaning", rating: 3, correct: true },
    { questionId: "e:meaning", rating: 4, correct: true },
  ];
  const labels = sessionRatingLabels(results, []);
  assert.deepEqual([...labels.values()], ["Again", "Hard", "Good", "Easy"]);
  assert.equal(labels.get("c:meaning"), "Hard");
  assert.equal(labels.get("skipped:meaning"), undefined);
  assert.deepEqual(
    sessionRatingLabels(JSON.parse(JSON.stringify(results)), []),
    labels,
  );
});
test("legacy progress and mixed results retain correct labels after queue filtering", () => {
  const results: SessionResult[] = [
    { rating: 1, correct: false },
    { rating: 3, correct: true },
    { rating: 4, correct: true, questionId: "new:meaning" },
  ];
  const labels = sessionRatingLabels(results, [
    "deleted:meaning",
    "remaining:meaning",
    "new:meaning",
  ]);
  assert.equal(labels.get("remaining:meaning"), "Good");
  assert.equal(labels.get("new:meaning"), "Easy");
  assert.equal(sessionRatingLabels([], []).size, 0);
  assert.equal(
    sessionRatingLabels([{ rating: 99, correct: true }], ["x"]).size,
    0,
  );
  assert.equal(
    sessionRatingLabels([{ rating: 1, correct: false }], []).size,
    0,
  );
});
