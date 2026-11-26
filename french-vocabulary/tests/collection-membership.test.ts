import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, newWord, inferSense, uid } from "../src/core/model";
import {
  membershipState,
  applyMembershipEdits,
} from "../src/core/collection-membership";
import { Store } from "../src/core/sqlite";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";
test("membership states and edits preserve untouched mixed groups and unrelated members", () => {
  const lib = emptyLibrary();
  lib.settings = {
    collections: [
      { id: "a", name: "A", wordIds: ["1"] },
      { id: "b", name: "B", wordIds: ["1", "2", "other"] },
      { id: "c", name: "C", wordIds: [] },
    ],
  };
  const before = structuredClone(lib.settings.collections!);
  assert.equal(membershipState(before[0], ["1", "2"]), "mixed");
  assert.equal(membershipState(before[1], ["1", "2"]), "all");
  assert.equal(membershipState(before[2], ["1", "2"]), "none");
  applyMembershipEdits(lib, ["1", "2"], { b: false, c: true }, before);
  assert.deepEqual(
    lib.settings.collections?.map((c) => c.wordIds),
    [["1"], ["other"], ["1", "2"]],
  );
  assert.throws(
    () => applyMembershipEdits(lib, ["1"], { b: true }, before),
    /changed/,
  );
  assert.throws(
    () => applyMembershipEdits(lib, ["1"], { missing: true }, before),
    /changed/,
  );
});
test("membership save uses lightweight settings transaction and survives delta replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-membership-"));
  try {
    const db = new Store(root);
    const w = newWord("ami", {
      id: uid(),
      pos: "n.m.",
      ipa: "",
      zh: "朋友",
      en: "friend",
      ...inferSense("n.m."),
    });
    await db.mutate((lib) => {
      lib.words = [w];
      lib.settings = { collections: [{ id: "a", name: "A", wordIds: [] }] };
    });
    const before = await db.load();
    const original = db.load.bind(db);
    db.load = async () => {
      throw Error("Must not load history");
    };
    await db.updateSettings(before.libraryId, (lib) =>
      applyMembershipEdits(
        lib,
        [w.id],
        { a: true },
        before.settings!.collections!,
      ),
    );
    db.load = original;
    const after = await db.load();
    assert.deepEqual(after.words, before.words);
    assert.deepEqual(after.reviews, before.reviews);
    assert.deepEqual(after.cards, before.cards);
    assert.deepEqual(after.settings?.collections?.[0].wordIds, [w.id]);
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
