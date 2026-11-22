import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  startSelectionRange,
  selectWordRange,
  setSelectionFamiliarity,
} from "../src/core/browse-selection";
import { Store } from "../src/core/sqlite";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";
import {
  createCollection,
  changeCollectionMembers,
  collectionById,
} from "../src/core/collections";

test("range selection includes both endpoints in the current order, even beyond rendered pages", () => {
  const order = Array.from({ length: 2500 }, (_, i) => String(i));
  const start = startSelectionRange(order, "10");
  assert.deepEqual(selectWordRange(order, start, "200"), order.slice(10, 201));
  assert.deepEqual(
    selectWordRange(order, startSelectionRange(order, "200"), "10"),
    order.slice(10, 201),
  );
  const reverse = [...order].reverse();
  assert.deepEqual(
    selectWordRange(reverse, startSelectionRange(reverse, "200"), "190"),
    reverse.slice(reverse.indexOf("200"), reverse.indexOf("190") + 1),
  );
  assert.deepEqual(selectWordRange(order, start, "10"), ["10"]);
});

test("sense rows deduplicate to words and changes to order or filters reject stale anchors", () => {
  const rows = ["a", "a", "b", "c", "c"];
  assert.deepEqual(selectWordRange(rows, startSelectionRange(rows, "a"), "c"), [
    "a",
    "b",
    "c",
  ]);
  const start = startSelectionRange(["a", "b", "c"], "a");
  assert.throws(() => selectWordRange(["c", "b", "a"], start, "c"), /changed/);
  assert.throws(() => selectWordRange(["a", "c"], start, "c"), /changed/);
  assert.throws(
    () => selectWordRange(["a", "b", "c"], start, "missing"),
    /endpoint/,
  );
  assert.throws(() => startSelectionRange(["a"], "missing"), /not in/);
});

test("range membership and bulk familiarity save once per word without changing FSRS or practice", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-selection-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(
        lib,
        [
          ["a", "n.m.", "first"],
          ["b", "n.m.", "second"],
          ["c", "n.m.", "third"],
          ["d", "n.m.", "fourth"],
        ],
        ["word", "pos", "en"],
      );
      const q = questions(lib, "meaning", true)[0];
      recordAnswer(lib, q, 3, "", true);
    });
    const lib = await db.load();
    const ids = lib.words.map((w) => w.id);
    const range = selectWordRange(
      ids,
      startSelectionRange(ids, ids[1]),
      ids[2],
    );
    const scheduling = JSON.stringify({
      cards: lib.cards,
      reviews: lib.reviews,
    });
    const flags = lib.words.map((w) => [w.practice, w.archived]);
    const collectionId = await db.mutate((l) => {
      const id = createCollection(l, "Range");
      changeCollectionMembers(l, id, range, true);
      setSelectionFamiliarity(l, [...range, ...range], "known");
      return id;
    });
    let saved = await new Store(root).load();
    assert.deepEqual(
      saved.words.map((w) => w.familiarity),
      ["unmarked", "known", "known", "unmarked"],
    );
    assert.deepEqual(collectionById(saved, collectionId).wordIds, range);
    assert.equal(
      JSON.stringify({ cards: saved.cards, reviews: saved.reviews }),
      scheduling,
    );
    assert.deepEqual(
      saved.words.map((w) => [w.practice, w.archived]),
      flags,
    );
    await db.mutate((l) => setSelectionFamiliarity(l, range, "fuzzy"));
    saved = await db.load();
    assert.equal(saved.words[1].familiarity, "fuzzy");
    await db.mutate((l) => setSelectionFamiliarity(l, range, "unmarked"));
    assert.ok(
      (await db.load()).words.every((w) => w.familiarity === "unmarked"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
