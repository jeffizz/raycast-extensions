import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  questions,
  orderRecallQuestions,
  recordAnswer,
} from "../src/core/learning";

test("familiarity sources preserve scheduling, eligibility and card identity", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["z", "n.m.", "last"],
      ["a", "n.f.", "first"],
      ["b", "n.m.", "middle"],
    ],
    ["word", "pos", "en"],
  );
  lib.words[0].familiarity = "known";
  lib.words[1].familiarity = "fuzzy";
  lib.words[2].familiarity = "unknown";
  for (const mode of ["meaning", "spelling", "gender"] as const) {
    const original = questions(lib, mode, true);
    lib.settings = {
      practice: { [mode]: { autoSpeak: false, scope: "fuzzy", wordIds: [] } },
    };
    validateLibrary(lib);
    assert.equal(questions(lib, mode, true).length, 2);
    lib.settings.practice![mode]!.scope = "known";
    const known = questions(lib, mode, true);
    assert.equal(known.length, 1);
    assert.equal(
      known[0].id,
      original.find((q) => q.word.id === lib.words[0].id)!.id,
    );
    recordAnswer(lib, known[0], 3, known[0].expected, true);
    lib.cards.find((c) => c.id === known[0].id)!.card.due =
      "2999-01-01T00:00:00.000Z";
    assert.equal(questions(lib, mode).length, 0);
    assert.equal(questions(lib, mode, true).length, 1);
    lib.words[0].archived = true;
    assert.equal(questions(lib, mode, true).length, 0);
    lib.words[0].archived = false;
    lib.words[0].practice = false;
    assert.equal(questions(lib, mode, true).length, 0);
    lib.words[0].practice = true;
  }
});

test("recall ordering changes only the queue order", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["z", "n.m.", "last"],
      ["a", "n.f.", "first"],
      ["b", "n.m.", "middle"],
    ],
    ["word", "pos", "en"],
  );
  for (const mode of ["meaning", "spelling", "gender"] as const) {
    const queue = questions(lib, mode, true);
    const before = JSON.stringify(lib);
    const names = (order: Parameters<typeof orderRecallQuestions>[2]) =>
      orderRecallQuestions(queue, lib, order, () => 0).map((q) => q.word.word);
    assert.deepEqual(names("import"), ["z", "a", "b"]);
    assert.deepEqual(names("import-desc"), ["b", "a", "z"]);
    assert.deepEqual(names("alphabetical"), ["a", "b", "z"]);
    assert.deepEqual(
      names("scheduled"),
      queue.map((q) => q.word.word),
    );
    assert.deepEqual([...names("random")].sort(), ["a", "b", "z"]);
    assert.equal(JSON.stringify(lib), before);
  }
});
