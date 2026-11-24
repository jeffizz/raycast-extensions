import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { applyImport } from "../src/core/importer";
import { emptyLibrary } from "../src/core/model";
import {
  moveGroupWord,
  reorderedGroupName,
  orderedGroupWords,
  sortedGroupIds,
} from "../src/core/group-order";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";

test("generated titles follow order, while custom titles and missing-word titles remain intact", () => {
  const words = new Map([
    ["a", "ami"],
    ["b", "école"],
    ["c", "ami"],
  ]);
  assert.equal(
    reorderedGroupName("ami, école", ["a", "b"], ["b", "a"], words),
    "école, ami",
  );
  assert.equal(
    reorderedGroupName("ami · école", ["a", "b"], ["b", "a"], words),
    "école, ami",
  );
  assert.equal(
    reorderedGroupName("My notes", ["a", "b"], ["b", "a"], words),
    "My notes",
  );
  assert.equal(
    reorderedGroupName("ami, école", ["a", "b", "c"], ["c", "b", "a"], words),
    "ami, école",
  );
  assert.equal(
    reorderedGroupName("Keep me", ["missing"], ["missing"], words),
    "Keep me",
  );
});

test("automatic title and order commit together and survive backup replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-group-title-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["ami"], ["école"]], ["word"]);
      lib.groups.push({
        id: "auto",
        name: "ami, école",
        notes: "Keep notes",
        updatedAt: "",
        wordIds: lib.words.map((w) => w.id),
      });
    });
    const before = await db.load();
    const ids = before.groups[0].wordIds;
    await db.reorderGroup(before.libraryId, "auto", ids, [...ids].reverse());
    const after = await new Store(root).load();
    assert.equal(after.groups[0].name, "école, ami");
    assert.equal(after.groups[0].notes, "Keep notes");
    assert.deepEqual(after.groups[0].wordIds, [...ids].reverse());
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
    await db.exportSQLite(join(root, "snapshot.sqlite"));
    assert.deepEqual(
      (await readSQLiteBackup(await readFile(join(root, "snapshot.sqlite"))))
        .groups,
      after.groups,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("group order helpers preserve membership, senses and input order", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["zèbre"], ["ami"], ["école"]], ["word"]);
  const ids = lib.words.map((w) => w.id);
  const group = {
    id: "g",
    name: "Custom name",
    notes: "Notes",
    updatedAt: "",
    wordIds: [ids[2], ids[0], ids[1]],
  };
  assert.deepEqual(
    orderedGroupWords(lib, group).map((w) => w.word),
    ["école", "zèbre", "ami"],
  );
  assert.deepEqual(sortedGroupIds(lib, group, "library"), ids);
  assert.deepEqual(sortedGroupIds(lib, group, "alphabetical"), [
    ids[1],
    ids[2],
    ids[0],
  ]);
  assert.deepEqual(moveGroupWord(group.wordIds, ids[0], -1), [
    ids[0],
    ids[2],
    ids[1],
  ]);
  assert.deepEqual(moveGroupWord(group.wordIds, ids[2], -1), group.wordIds);
  assert.deepEqual(group.wordIds, [ids[2], ids[0], ids[1]]);
});

test("saved group orders survive reopening, increments and SQLite snapshots without history loading", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-group-order-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["zèbre"], ["ami"], ["école"]], ["word"]);
      lib.groups.push({
        id: "g",
        name: "Custom name",
        notes: "Markdown notes",
        updatedAt: "",
        wordIds: lib.words.map((w) => w.id),
      });
    });
    const before = await db.load();
    const ids = before.groups[0].wordIds;
    const afterIds = moveGroupWord(ids, ids[2], -1);
    db.load = async () => {
      throw Error("Reordering must not load history");
    };
    await db.reorderGroup(before.libraryId, "g", ids, afterIds);
    const reopened = new Store(root);
    const after = await reopened.load();
    assert.deepEqual(after.groups[0].wordIds, afterIds);
    assert.equal(after.groups[0].name, "Custom name");
    assert.equal(after.groups[0].notes, "Markdown notes");
    assert.deepEqual(after.words, before.words);
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
    await reopened.exportSQLite(join(root, "order.sqlite"));
    assert.deepEqual(
      (await readSQLiteBackup(await readFile(join(root, "order.sqlite"))))
        .groups,
      after.groups,
    );
    await assert.rejects(
      db.reorderGroup(before.libraryId, "g", ids, [...ids].reverse()),
      /Group changed/,
    );
    await assert.rejects(
      db.reorderGroup("wrong-library", "g", afterIds, ids),
      /Group changed/,
    );
    await assert.rejects(
      db.reorderGroup(before.libraryId, "g", afterIds, [ids[0]]),
      /preserve/,
    );
    assert.deepEqual(await reopened.load(), after);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
