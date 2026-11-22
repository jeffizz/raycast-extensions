import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  createCollection,
  changeCollectionMembers,
  collectionSelectionKey,
  collectionSelectionIds,
  collectionSelectionMembers,
  collectionWordIds,
} from "../src/core/collections";
import { questions } from "../src/core/learning";
import {
  modeSettings,
  practiceSourceFilters,
} from "../src/core/practice-settings";

test("multi-collection union deduplicates words and preserves legacy and session identity", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["ami", "n.m.", "friend"],
      ["table", "n.f.", "table"],
      ["aller", "v.i.", "go"],
    ],
    ["word", "pos", "en"],
  );
  const a = createCollection(lib, "A"),
    b = createCollection(lib, "B");
  changeCollectionMembers(lib, a, [lib.words[0].id], true);
  changeCollectionMembers(lib, b, [lib.words[0].id, lib.words[1].id], true);
  const key = collectionSelectionKey([b, a, a]);
  assert.equal(key, collectionSelectionKey([a, b]));
  assert.equal(collectionSelectionKey([a]), a);
  assert.deepEqual(collectionSelectionIds(""), []);
  assert.equal(collectionSelectionMembers(lib, key)!.length, 2);
  assert.deepEqual(
    collectionWordIds(lib, key),
    collectionSelectionMembers(lib, key),
  );
  lib.settings!.practice = {
    meaning: {
      autoSpeak: false,
      scope: "default",
      wordIds: [],
      sourceFilters: {
        collectionId: "",
        collectionIds: [a, b],
        pos: "noun",
        familiarity: "all",
      },
    },
  };
  validateLibrary(lib);
  assert.equal(questions(lib, "meaning", true).length, 2);
  assert.equal(
    practiceSourceFilters(modeSettings(lib, "meaning")).collectionId,
    key,
  );
  lib.words[0].practice = false;
  assert.equal(questions(lib, "meaning", true).length, 1);
  lib.settings!.practice!.meaning!.sourceFilters!.collectionIds = [];
  assert.equal(questions(lib, "meaning", true).length, 1);
  lib.settings!.practice!.meaning!.sourceFilters = {
    collectionId: a,
    pos: "all",
    familiarity: "all",
  };
  assert.equal(questions(lib, "meaning", true).length, 0);
  assert.deepEqual(
    collectionSelectionMembers(lib, collectionSelectionKey(["deleted", b])),
    collectionSelectionMembers(lib, b),
  );
});
