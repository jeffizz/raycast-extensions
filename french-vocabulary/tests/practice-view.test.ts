import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  practiceLayoutKey,
  practiceListRow,
  supportsDelayedPronunciation,
} from "../src/core/practice-view";
import { questions, recordAnswer } from "../src/core/learning";

function word() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["ami", "n.m.", "朋友", "friend"]],
    ["word", "pos", "zh", "en"],
  );
  return lib.words[0];
}
test("recall meaning list hides current and future meanings until revealed", () => {
  const w = word(),
    s = w.senses[0],
    before = JSON.stringify(w);
  for (const position of [0, 1, 2]) {
    const row = practiceListRow(
      w,
      s,
      "meaning",
      position,
      1,
      false,
      "zh-first",
    );
    assert.equal(row.title, "ami");
    assert.equal(row.subtitle.includes("friend"), position < 1);
    assert.equal(row.subtitle.includes("朋友"), position < 1);
  }
  assert.ok(
    practiceListRow(w, s, "meaning", 1, 1, true, "zh-first").subtitle.includes(
      "friend",
    ),
  );
  assert.ok(
    !practiceListRow(w, s, "meaning", 2, 1, true, "zh-first").subtitle.includes(
      "friend",
    ),
  );
  assert.equal(JSON.stringify(w), before);
});
test("recall spelling list shows meanings without leaking future French answers", () => {
  const w = word(),
    s = w.senses[0];
  assert.equal(
    practiceListRow(w, s, "spelling", 1, 1, false, "zh-first").title,
    "2",
  );
  assert.equal(
    practiceListRow(w, s, "spelling", 1, 1, true, "zh-first").title,
    "ami",
  );
  assert.equal(
    practiceListRow(w, s, "spelling", 2, 1, true, "zh-first").title,
    "3",
  );
  assert.ok(
    practiceListRow(
      w,
      s,
      "spelling",
      1,
      1,
      false,
      "zh-first",
    ).subtitle.includes("朋友"),
  );
  assert.ok(
    !practiceListRow(
      w,
      s,
      "spelling",
      1,
      1,
      false,
      "zh-only",
    ).subtitle.includes("friend"),
  );
  assert.equal(
    practiceListRow(w, s, "copy", 2, 1, false, "zh-first").title,
    "ami",
  );
});
test("recall layouts and pronunciation timing remain independent per mode", () => {
  assert.equal(practiceLayoutKey("copy"), "copy-spelling-list-layout");
  assert.notEqual(practiceLayoutKey("meaning"), practiceLayoutKey("spelling"));
  for (const mode of ["copy", "meaning", "spelling"] as const)
    assert.ok(supportsDelayedPronunciation(mode));
  assert.equal(supportsDelayedPronunciation("gender"), false);
});
test("revealing list meanings is render-only and grading still records the selected FSRS rating", () => {
  for (const grade of [1, 2, 3, 4] as const) {
    const lib = emptyLibrary();
    applyImport(lib, [["ami", "n.m.", "friend"]], ["word", "pos", "en"]);
    const q = questions(lib, "meaning", true)[0],
      before = JSON.stringify(lib);
    practiceListRow(q.word, q.sense, "meaning", 0, 0, true, "zh-first");
    assert.equal(JSON.stringify(lib), before);
    recordAnswer(lib, q, grade, "", grade !== 1);
    assert.equal(lib.reviews.length, 1);
    assert.equal(lib.reviews[0].rating, grade);
  }
});
