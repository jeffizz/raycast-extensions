import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";
import { setSelectionFamiliarity } from "../src/core/browse-selection";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";
import { Store, readSQLiteBackup } from "../src/core/sqlite";

test("Fuzzy promotion requires two consecutive successes and failures reset progress", () => {
  for (const initial of ["fuzzy", "unknown", "known"] as const) {
    const lib = sample();
    const w = lib.words[0];
    w.familiarity = initial;
    const q = questions(lib, "meaning", true)[0];
    if (initial === "known") recordAnswer(lib, q, 2, "", true, true);
    recordAnswer(lib, q, 3, "", true, true);
    assert.notEqual(w.familiarity, "known");
    assert.equal(w.meaningFamiliaritySuccessStreak, 1);
    recordAnswer(lib, q, 1, "", false, true);
    assert.equal(w.meaningFamiliaritySuccessStreak ?? 0, 0);
    recordAnswer(lib, q, 4, "", true, true);
    assert.equal(w.familiarity === "known", false);
    recordAnswer(lib, q, 3, "", true, true);
    assert.equal(w.familiarity, "known");
    assert.equal(w.meaningFamiliaritySuccessStreak ?? 0, 0);
  }
});
test("disabled link and manual familiarity reset progress; other modes leave it alone", () => {
  const lib = sample(),
    w = lib.words[0];
  w.familiarity = "fuzzy";
  w.meaningFamiliaritySuccessStreak = 1;
  recordAnswer(lib, questions(lib, "spelling", true)[0], 3, "ami", true, true);
  assert.equal(w.meaningFamiliaritySuccessStreak, 1);
  recordAnswer(lib, questions(lib, "meaning", true)[0], 3, "", true);
  assert.equal(w.familiarity, "fuzzy");
  assert.equal(w.meaningFamiliaritySuccessStreak, undefined);
  w.meaningFamiliaritySuccessStreak = 1;
  setSelectionFamiliarity(lib, [w.id], "fuzzy");
  assert.equal(w.meaningFamiliaritySuccessStreak, undefined);
  validateLibrary(lib);
  for (const invalid of [-1, 2, null, "1"]) {
    const broken = JSON.parse(JSON.stringify(lib));
    broken.words[0].meaningFamiliaritySuccessStreak = invalid;
    assert.throws(() => validateLibrary(broken), /word/);
  }
});
test("streak survives SQLite snapshot and logical increments without schema changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-streak-backup-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["ami"]], ["word"]);
      lib.words[0].familiarity = "fuzzy";
    });
    const before = await db.load();
    await db.mutate((lib) =>
      recordAnswer(lib, questions(lib, "meaning", true)[0], 3, "", true, true),
    );
    const after = await db.load();
    assert.equal(after.words[0].meaningFamiliaritySuccessStreak, 1);
    assert.deepEqual(
      applyDelta(
        before,
        JSON.parse(JSON.stringify(makeDelta(baseline(before), after))),
      ),
      after,
    );
    await db.exportSQLite(join(root, "test.sqlite"));
    assert.deepEqual(
      await readSQLiteBackup(await readFile(join(root, "test.sqlite"))),
      after,
    );
    await db.mutate((lib) =>
      recordAnswer(lib, questions(lib, "meaning", true)[0], 4, "", true, true),
    );
    assert.equal((await db.load()).words[0].familiarity, "known");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
function sample() {
  const lib = emptyLibrary();
  applyImport(lib, [["ami", "n.m.", "friend"]], ["word", "pos", "en"]);
  return lib;
}
test("enabled meaning ratings map Again/Hard to Fuzzy and Good/Easy to Know", () => {
  for (const rating of [1, 2, 3, 4] as const) {
    const lib = sample();
    const q = questions(lib, "meaning", true)[0];
    const queueIds = [q.id];
    const updated = recordAnswer(lib, q, rating, "", rating !== 1, true);
    assert.equal(updated.familiarity, rating <= 2 ? "fuzzy" : "known");
    assert.equal(lib.reviews.length, 1);
    assert.equal(lib.reviews[0].rating, rating);
    assert.equal(lib.cards.length, 1);
    assert.deepEqual([q.id], queueIds);
  }
});
test("link defaults off and never updates familiarity for other practice modes", () => {
  for (const mode of ["meaning", "copy", "spelling", "gender"] as const) {
    const lib = sample();
    lib.words[0].familiarity = "known";
    const q = questions(lib, mode, true)[0];
    assert.ok(q);
    recordAnswer(lib, q, 1, "wrong", false, mode !== "meaning");
    assert.equal(lib.words[0].familiarity, "known");
  }
});
test("meaning rating and familiarity persist together; other cards stay unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-meaning-familiarity-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["ami", "n.m.", "friend"]], ["word", "pos", "en"]);
      const q = questions(lib, "spelling", true)[0];
      recordAnswer(lib, q, 3, "ami", true);
    });
    const before = await db.load();
    const otherCard = structuredClone(before.cards[0]);
    await db.mutate((lib) =>
      recordAnswer(lib, questions(lib, "meaning", true)[0], 2, "", true, true),
    );
    let restored = await new Store(root).load();
    assert.equal(restored.words[0].familiarity, "fuzzy");
    assert.deepEqual(
      restored.cards.find((c) => c.id === otherCard.id),
      otherCard,
    );
    assert.equal(restored.reviews.length, 2);
    const committed = JSON.stringify(restored);
    await assert.rejects(
      db.mutate((lib) => {
        recordAnswer(
          lib,
          questions(lib, "meaning", true)[0],
          4,
          "",
          true,
          true,
        );
        throw Error("rollback");
      }),
      /rollback/,
    );
    restored = await db.load();
    assert.equal(JSON.stringify(restored), committed);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
