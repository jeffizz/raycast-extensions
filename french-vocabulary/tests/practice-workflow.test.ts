import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, setPractice } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  practiceSpeechTexts,
  questions,
  recordAnswer,
  shouldAutoSubmit,
} from "../src/core/learning";
import { spellingDiff } from "../src/core/presentation";
import { Store, sqlite, sql, readSQLiteBackup } from "../src/core/sqlite";
import { readFile } from "node:fs/promises";

function library() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["étudiante", "n.f.", "", "student", "女学生"],
      ["demain", "adv.", "", "tomorrow", "明天"],
    ],
    ["word", "pos", "ipa", "en", "zh"],
  );
  return lib;
}

test("practice defaults to all active words; explicit exclusion survives reimport and archive cycles", () => {
  const lib = library();
  assert.equal(questions(lib, "copy").length, 2);
  const w = lib.words[0];
  setPractice(w, false);
  assert.equal(w.practice, false);
  applyImport(
    lib,
    [["étudiante", "n.f.", "", "student", "女学生"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  assert.equal(questions(lib, "copy").length, 1);
  w.archived = true;
  w.archived = false;
  assert.equal(w.practice, false);
  setPractice(w, true);
  assert.equal(w.practice, true);
  w.archived = true;
  assert.equal(questions(lib, "copy").length, 1);
  w.archived = false;
  assert.equal(questions(lib, "copy").length, 2);
});

test("practice false persists directly without opt-in migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-optout-"));
  try {
    const s = new Store(root);
    await s.mutate((lib) => Object.assign(lib, library()));
    const before = await s.load();
    const id = before.words[0].id;
    // The sole practice flag is authoritative; loading must not rewrite it.
    await sqlite(
      s.path,
      `UPDATE words SET practice=0,data=json_set(data,'$.practice',json('false')) WHERE id=${sql(id)};`,
    );
    const upgraded = new Store(root);
    const migrated = await upgraded.load();
    assert.equal(migrated.words[0].practice, false);
    assert.equal(migrated.revision, before.revision);
    assert.equal((await new Store(root).load()).revision, migrated.revision);
    await upgraded.updateWord(id, (w) => setPractice(w, false));
    const reopened = await new Store(root).load();
    assert.equal(reopened.words[0].practice, false);
    assert.equal(questions(reopened, "copy").length, 1);
    const file = await upgraded.exportSQLite(join(root, "export.sqlite"));
    assert.equal(
      (await readSQLiteBackup(await readFile(file))).words[0].practice,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("both spelling modes auto-submit only complete exact input, including NFC equivalents", () => {
  const expected = "étudiante";
  for (const partial of [
    "",
    "é",
    "étudian",
    "etudiante",
    "Étudiante",
    " étudiante",
    "étudiante ",
  ])
    assert.equal(shouldAutoSubmit(partial, expected), false);
  assert.equal(shouldAutoSubmit(expected, expected), true);
  assert.equal(shouldAutoSubmit(expected.normalize("NFD"), expected), true);
  assert.equal(
    spellingDiff("etudiante", expected),
    "| |\n| --- |\n| étudiante |\n| etudiante |",
  );
});

test("noun gender speech omits revealing articles until checked; recall spelling has pronunciation", () => {
  const lib = library();
  const gender = questions(lib, "gender", true)[0];
  assert.deepEqual(practiceSpeechTexts(gender, false), ["étudiante"]);
  assert.deepEqual(practiceSpeechTexts(gender, true), [
    "étudiante",
    "une étudiante",
  ]);
  const spelling = questions(lib, "spelling", true).find(
    (q) => q.word.word === "étudiante",
  )!;
  assert.deepEqual(practiceSpeechTexts(spelling, false), [
    "étudiante",
    "une étudiante",
  ]);
});

test("checked answers persist after an unfinished session and reference original words, without duplication", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-partial-session-"));
  try {
    const store = new Store(root);
    await store.mutate((lib) => Object.assign(lib, library()));
    const before = await store.load();
    const queue = questions(before, "spelling", true);
    await store.mutate((lib) => recordAnswer(lib, queue[0], 1, "wrong", false));
    const reopened = await new Store(root).load();
    assert.equal(reopened.words.length, 2);
    assert.deepEqual(
      reopened.words.map((w) => w.id),
      before.words.map((w) => w.id),
    );
    assert.equal(reopened.reviews.length, 1);
    assert.equal(reopened.reviews[0].wordId, queue[0].word.id);
    assert.equal(reopened.reviews[0].correct, false);
    assert.equal(reopened.cards.length, 1);
    assert.ok(!reopened.reviews.some((r) => r.wordId === queue[1].word.id));
    const copy = questions(reopened, "copy", true)[0];
    await store.mutate((lib) =>
      recordAnswer(lib, copy, 3, copy.expected, true),
    );
    const afterCopy = await new Store(root).load();
    assert.equal(afterCopy.reviews.length, 2);
    assert.equal(afterCopy.cards.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
