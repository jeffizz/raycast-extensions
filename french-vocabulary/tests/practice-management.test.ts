import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { questions } from "../src/core/learning";
import { nextPracticeIndex } from "../src/core/copy-session";

test("archived and excluded words skip all later question senses without mutating scheduling", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["ami"], ["table"], ["livre"]], ["word"]);
  for (const mode of ["copy", "meaning"] as const) {
    const queue = questions(lib, mode, true);
    const archived = { ...queue[0].word, archived: true };
    const excluded = { ...queue[1].word, practice: false };
    const updates = { [archived.id]: archived, [excluded.id]: excluded };
    const before = JSON.stringify(lib);
    assert.equal(nextPracticeIndex(queue, 0, updates), 2);
    assert.equal(
      nextPracticeIndex([queue[0], queue[1], queue[0], queue[2]], 0, updates),
      3,
    );
    assert.equal(nextPracticeIndex(queue, queue.length, updates), queue.length);
    assert.equal(JSON.stringify(lib), before);
  }
});
test("practice management is enabled for all modes and preserves rating shortcuts", () => {
  const source = readFileSync(
    new URL("../src/practice.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("manageWords = true"));
  assert.ok(!source.includes("manageWords && copy &&"));
  assert.ok(source.includes('copy ? ["cmd"] : ["cmd", "shift"]'));
  assert.ok(source.includes('tooltip: "Archived"'));
  assert.ok(
    !source.includes(
      "(listLayout || (copy && manageWords)) && familiarityIcon",
    ),
  );
});
