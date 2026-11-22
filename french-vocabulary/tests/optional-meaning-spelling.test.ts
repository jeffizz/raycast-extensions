import test from "node:test";
import assert from "node:assert/strict";
import { optionalMeaningSpelling } from "../src/core/practice-view";
import { spellingDiff } from "../src/core/presentation";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";

test("meaning spelling is optional and silent before reveal or for correct input", () => {
  for (const input of ["", "  ", "été", "e\u0301te\u0301"]) {
    assert.equal(optionalMeaningSpelling(input, "été", true), undefined);
  }
  assert.equal(optionalMeaningSpelling("wrong", "été", false), undefined);
  assert.deepEqual(optionalMeaningSpelling("ete", "été", true), {
    expected: "été",
    answer: "ete",
  });
  assert.deepEqual(optionalMeaningSpelling("Été", "été", true), {
    expected: "été",
    answer: "Été",
  });
});
test("incorrect meaning spelling uses the existing correct-first comparison without mutating the word", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["été", "n.m.", "summer"]], ["word", "pos", "en"]);
  const q = questions(lib, "meaning", true)[0];
  const before = JSON.stringify(lib);
  const mismatch = optionalMeaningSpelling("ete", q.expected, true)!;
  const table = spellingDiff(mismatch.answer, mismatch.expected);
  assert.ok(table.indexOf("été") < table.indexOf("ete"));
  assert.equal(JSON.stringify(lib), before);
  assert.equal(lib.reviews.length, 0);
});
test("meaning spelling does not override explicit recall ratings or create spelling reviews", () => {
  for (const input of ["", "ami", "wrong"]) {
    for (const rating of [1, 2, 3, 4] as const) {
      const lib = emptyLibrary();
      applyImport(lib, [["ami"]], ["word"]);
      const q = questions(lib, "meaning", true)[0];
      optionalMeaningSpelling(input, q.expected, true);
      assert.equal(lib.cards.length, 0);
      recordAnswer(lib, q, rating, input, rating !== 1);
      assert.equal(lib.reviews.length, 1);
      assert.equal(lib.reviews[0].rating, rating);
      assert.equal(lib.reviews[0].mode, "meaning");
      assert.equal(lib.reviews[0].correct, rating !== 1);
      assert.equal(lib.cards[0].mode, "meaning");
    }
  }
});
