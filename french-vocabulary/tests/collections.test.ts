import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  addImportedWordsToCollection,
  changeCollectionMembers,
  collectionById,
  collectionWordIds,
  createCollection,
  deleteCollection,
  renameCollection,
} from "../src/core/collections";
import { questions, recordAnswer } from "../src/core/learning";
import { dailyUsage } from "../src/core/daily-limits";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";

test("collections rename by stable identity and share deduplicated word membership", () => {
  const lib = emptyLibrary();
  validateLibrary(lib);
  applyImport(
    lib,
    [
      ["ami", "n.m.", "friend"],
      ["table", "n.f.", "table"],
    ],
    ["word", "pos", "en"],
  );
  const a = createCollection(lib, "Unit 1"),
    b = createCollection(lib, "Unit 2");
  changeCollectionMembers(
    lib,
    a,
    [lib.words[0].id, lib.words[0].id, "missing"],
    true,
  );
  changeCollectionMembers(lib, b, [lib.words[0].id], true);
  renameCollection(lib, a, "Renamed");
  assert.equal(collectionById(lib, a).name, "Renamed");
  assert.deepEqual(collectionWordIds(lib, a), [lib.words[0].id]);
  assert.throws(() => renameCollection(lib, a, "unit 2"), /already exists/);
  assert.throws(() => createCollection(lib, "   "), /name/);
  const lexical = JSON.stringify(lib.words);
  const first = questions(lib, "spelling", true, collectionWordIds(lib, a))[0];
  recordAnswer(lib, first, 3, first.expected, true);
  const other = questions(lib, "spelling", true, collectionWordIds(lib, b))[0];
  assert.equal(other.id, first.id);
  assert.equal(lib.cards.length, 1);
  assert.equal(dailyUsage(lib, "spelling").newToday.size, 1);
  changeCollectionMembers(lib, a, [first.word.id], false);
  assert.equal(collectionWordIds(lib, a)!.length, 0);
  assert.equal(collectionWordIds(lib, b)!.length, 1);
  const saved = JSON.stringify({
    words: lib.words,
    cards: lib.cards,
    reviews: lib.reviews,
  });
  deleteCollection(lib, b);
  assert.equal(
    JSON.stringify({
      words: lib.words,
      cards: lib.cards,
      reviews: lib.reviews,
    }),
    saved,
  );
  assert.throws(() => collectionWordIds(lib, b), /no longer exists/);
  assert.equal(JSON.parse(lexical).length, lib.words.length);
  validateLibrary(lib);
});

test("import collection includes new, exact duplicates, kept and merged word heads without duplication", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["ami", "n.m.", "friend", "old"]],
    ["word", "pos", "en", "zh"],
  );
  const id = createCollection(lib, "New batch");
  const originalId = lib.words[0].id;
  const rows = [
    ["ami", "n.m.", "friend", "old"],
    ["ami", "n.m.", "friend", "new"],
    ["bonjour", "interj.", "hello", "greeting"],
  ];
  applyImport(lib, rows, ["word", "pos", "en", "zh"], "batch", () => ({
    action: "keep",
  }));
  addImportedWordsToCollection(
    lib,
    id,
    rows.map((row) => row[0]),
  );
  assert.equal(collectionById(lib, id).wordIds.length, 2);
  assert.equal(lib.words[0].id, originalId);
  applyImport(lib, [rows[1]], ["word", "pos", "en", "zh"], "next", () => ({
    action: "merge",
    fields: { zh: "existing-first" },
  }));
  addImportedWordsToCollection(lib, id, ["ami"]);
  assert.equal(lib.words[0].senses[0].zh, "old; new");
  assert.equal(collectionById(lib, id).wordIds.length, 2);
  lib.words[0].familiarity = "fuzzy";
  assert.equal(
    questions(lib, "meaning", true, collectionWordIds(lib, id), "fuzzy").length,
    1,
  );
  lib.words[0].archived = true;
  assert.equal(
    questions(lib, "meaning", true, collectionWordIds(lib, id), "fuzzy").length,
    0,
  );
});

test("collections survive SQLite exports and settings-only increments; reset clears them", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-collections-"));
  try {
    const db = new Store(root);
    const id = await db.mutate((lib) => {
      applyImport(lib, [["ami"]], ["word"]);
      const id = createCollection(lib, "Original");
      changeCollectionMembers(lib, id, [lib.words[0].id], true);
      return id;
    });
    const before = await db.load();
    await db.mutate((lib) => renameCollection(lib, id, "Changed"));
    const after = await new Store(root).load();
    const delta = makeDelta(baseline(before), after);
    assert.deepEqual(applyDelta(before, delta).settings, after.settings);
    const path = join(root, "export.sqlite");
    await db.exportSQLite(path);
    const restored = await readSQLiteBackup(await readFile(path));
    assert.deepEqual(restored.settings, after.settings);
    assert.equal(collectionById(restored, id).name, "Changed");
    await db.resetLibrary();
    assert.equal((await db.load()).settings?.collections, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collection validation rejects malformed IDs, names and duplicate members", () => {
  const lib = emptyLibrary();
  const id = createCollection(lib, "Test");
  collectionById(lib, id).wordIds = ["same", "same"];
  assert.throws(() => validateLibrary(lib), /collections/);
  collectionById(lib, id).wordIds = [];
  lib.settings!.collections!.push({ id, name: "Another", wordIds: [] });
  assert.throws(() => validateLibrary(lib), /collections/);
});
