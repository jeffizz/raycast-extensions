import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  createCollection,
  changeCollectionMembers,
  deleteCollection,
} from "../src/core/collections";
import {
  modeSettings,
  practiceSourceFilters,
} from "../src/core/practice-settings";
import {
  questions,
  copyQuestionsInOrder,
  recordAnswer,
} from "../src/core/learning";
import { matchesWordFilters } from "../src/core/vocabulary-filters";
import { Store } from "../src/core/sqlite";
import { dailyUsage } from "../src/core/daily-limits";

function sample() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["ami", "n.m.", "friend"],
      ["aller", "v.i.", "go"],
      ["table", "n.f.", "table"],
    ],
    ["word", "pos", "en"],
  );
  lib.words[0].familiarity = "fuzzy";
  lib.words[1].familiarity = "known";
  lib.words[2].familiarity = "unknown";
  return lib;
}
test("practice source ignores retired lists and intersects collection, POS and familiarity", () => {
  const lib = sample();
  const id = createCollection(lib, "Unit");
  changeCollectionMembers(
    lib,
    id,
    lib.words.map((w) => w.id),
    true,
  );
  lib.settings!.practice = {
    meaning: {
      autoSpeak: true,
      dailyNew: 4,
      scope: "selected",
      wordIds: lib.words.map((w) => w.id),
      sourceFilters: { collectionId: id, pos: "noun", familiarity: "fuzzy" },
    },
  };
  const before = JSON.stringify(lib);
  const queue = questions(lib, "meaning", true);
  assert.deepEqual(queue.map((q) => q.word.word).sort(), ["ami", "table"]);
  assert.deepEqual(
    queue.map((q) => q.word.id).sort(),
    lib.words
      .filter((w) => matchesWordFilters(w, "noun", "fuzzy"))
      .map((w) => w.id)
      .sort(),
  );
  assert.equal(JSON.stringify(lib), before);
  lib.settings!.practice!.meaning!.wordIds = [lib.words[0].id];
  assert.equal(questions(lib, "meaning", true).length, 2);
  const q = questions(lib, "meaning", true)[0];
  recordAnswer(lib, q, 3, "", true);
  const card = JSON.stringify(lib.cards[0]);
  lib.settings!.practice!.meaning!.scope = "default";
  lib.settings!.practice!.meaning!.sourceFilters!.familiarity = "all";
  assert.equal(
    questions(lib, "meaning", true).find((x) => x.word.id === q.word.id)!.id,
    q.id,
  );
  assert.equal(JSON.stringify(lib.cards[0]), card);
  assert.equal(dailyUsage(lib, "meaning").newToday.size, 1);
  lib.words[0].archived = true;
  lib.words[2].practice = false;
  assert.equal(questions(lib, "meaning", true).length, 0);
  deleteCollection(lib, id);
  assert.equal(questions(lib, "meaning", true).length, 0);
});
test("old Fuzzy and Know sources remain compatible and Browse copy ignores saved practice filters", () => {
  const lib = sample();
  lib.settings = {
    practice: { meaning: { autoSpeak: false, scope: "fuzzy", wordIds: [] } },
  };
  assert.equal(
    practiceSourceFilters(modeSettings(lib, "meaning")).familiarity,
    "fuzzy",
  );
  assert.equal(questions(lib, "meaning", true).length, 2);
  lib.settings.practice!.meaning!.scope = "known";
  assert.equal(questions(lib, "meaning", true)[0].word.word, "aller");
  lib.settings.practice!.copy = {
    autoSpeak: false,
    scope: "default",
    wordIds: [],
    sourceFilters: { collectionId: "", pos: "verb", familiarity: "known" },
  };
  assert.equal(questions(lib, "copy", true).length, 1);
  assert.equal(copyQuestionsInOrder(lib, lib.words).length, 3);
  validateLibrary(lib);
});
test("practice source settings persist separately per mode and reject invalid filter values", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-source-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      lib.settings = {
        practice: {
          spelling: {
            autoSpeak: true,
            scope: "default",
            wordIds: [],
            dailyNew: 6,
            sourceFilters: {
              collectionId: "",
              pos: "noun",
              familiarity: "unmarked",
            },
          },
        },
      };
    });
    const lib = await new Store(root).load();
    assert.equal(
      practiceSourceFilters(modeSettings(lib, "spelling")).pos,
      "noun",
    );
    assert.equal(
      practiceSourceFilters(modeSettings(lib, "meaning")).pos,
      "all",
    );
    assert.equal(modeSettings(lib, "spelling").dailyNew, 6);
    const invalid = JSON.parse(JSON.stringify(lib));
    invalid.settings.practice.spelling.sourceFilters.pos = "invalid";
    assert.throws(() => validateLibrary(invalid), /source filters/);
    invalid.settings.practice.spelling.sourceFilters = null;
    assert.throws(() => validateLibrary(invalid), /source filters/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
