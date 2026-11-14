import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyImport, detectColumns, parseTable } from "../src/core/importer";
import {
  articles,
  emptyLibrary,
  inferSense,
  newWord,
  uid,
  validateLibrary,
} from "../src/core/model";
import {
  checkAnswer,
  questions,
  recordAnswer,
  similarWords,
} from "../src/core/learning";
import { Store, sqlite } from "../src/core/sqlite";

async function fixture() {
  const text = await readFile(join(__dirname, "sample.tsv"), "utf8");
  const p = detectColumns(text);
  const lib = emptyLibrary();
  const stats = applyImport(lib, p.rows, p.mapping);
  return { p, lib, stats };
}
test("real sample: five column detection, 28 rows, 27 word heads, 28 senses", async () => {
  const { p, lib, stats } = await fixture();
  assert.equal(p.rows.length, 28);
  assert.deepEqual(p.mapping, ["word", "pos", "ipa", "en", "zh"]);
  assert.equal(stats.words, 27);
  assert.equal(stats.senses, 1);
  assert.equal(lib.words.find((w) => w.word === "tableau")?.senses.length, 2);
  assert.ok(lib.words.some((w) => w.word === "chinois(e)"));
  assert.ok(lib.words.some((w) => w.word === "Chinois(e)"));
  assert.equal(
    lib.words.find((w) => w.word === "sculpteur(trice)")?.senses[0].ipa,
    "/skyl.tœʁ/ (tʁis)",
  );
  assert.ok(lib.words.every((w) => w.practice));
  validateLibrary(lib);
});
test("reimport is idempotent even after auxiliary gender enrichment", async () => {
  const { p, lib } = await fixture();
  lib.words[0].senses[0].genderSource = "user";
  const s = applyImport(lib, p.rows, p.mapping);
  assert.deepEqual(s, { words: 0, senses: 0, duplicates: 28, filled: 0 });
  assert.equal(lib.words.length, 27);
});
test("permuted bilingual headers work", () => {
  const p = detectColumns(
    "中文\tIPA\t英文\t词汇\t词性\n茶\t/te/\ttea\tthé\tn.m.",
  );
  assert.equal(p.header, true);
  assert.deepEqual(p.mapping, ["zh", "ipa", "en", "word", "pos"]);
  const l = emptyLibrary();
  applyImport(l, p.rows, p.mapping);
  assert.equal(l.words[0].word, "thé");
});
test("quoted multiline TSV and escaped CSV quote", () => {
  assert.deepEqual(parseTable('mot\t"line 1\nline 2"\t"a""b"\r\n'), [
    ["mot", "line 1\nline 2", 'a"b'],
  ]);
  assert.deepEqual(parseTable('word,en\n"café","coffee, café"'), [
    ["word", "en"],
    ["café", "coffee, café"],
  ]);
  assert.throws(() => parseTable('x\t"missing'));
});
test("different meanings retained; empty translations completed conservatively", () => {
  const l = emptyLibrary();
  applyImport(
    l,
    [["livre", "n.m.", "", "book", ""]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  let s = applyImport(
    l,
    [["livre", "n.m.", "/livʁ/", "book", "书"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  assert.equal(s.filled, 1);
  s = applyImport(
    l,
    [["livre", "n.f.", "/livʁ/", "pound", "磅"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  assert.equal(s.senses, 1);
  assert.equal(l.words[0].senses.length, 2);
});
test("accents and case remain identity significant", () => {
  const l = emptyLibrary();
  applyImport(l, [["ou"], ["où"], ["Chinois"], ["chinois"]], ["word"]);
  assert.equal(l.words.length, 4);
});
test("plural / elision / unknown h article rules", async () => {
  const { lib } = await fixture();
  const get = (x: string) => lib.words.find((w) => w.word === x)!;
  assert.deepEqual(articles(get("étudiante"), get("étudiante").senses[0]), [
    "une étudiante",
    "l’étudiante",
  ]);
  assert.deepEqual(
    articles(get("cartes de visite"), get("cartes de visite").senses[0]),
    ["des cartes de visite", "les cartes de visite"],
  );
  assert.deepEqual(
    articles(get("Chinois(e)"), get("Chinois(e)").senses[0]),
    [],
  );
  const w = newWord("héros", {
    id: uid(),
    pos: "n.m.",
    ipa: "",
    en: "hero",
    zh: "",
    ...inferSense("n.m."),
  });
  assert.deepEqual(articles(w, w.senses[0]), ["un héros"]);
  w.senses[0].onset = "aspirated-h";
  assert.deepEqual(articles(w, w.senses[0]), ["un héros", "le héros"]);
});
test("practice is default-on with opt-out and archive exclusion; gender must be unambiguous", async () => {
  const { lib } = await fixture();
  assert.ok(questions(lib, "spelling").length > 0);
  const excluded = lib.words[0];
  excluded.practice = false;
  assert.ok(questions(lib, "spelling").every((q) => q.word.id !== excluded.id));
  const q = questions(lib, "gender");
  assert.ok(q.length > 0);
  assert.ok(q.every((q) => q.sense.gender === "m" || q.sense.gender === "f"));
  lib.words.forEach((w) => (w.archived = true));
  assert.equal(questions(lib, "gender", true).length, 0);
});
test("FSRS modes independent; copy does not alter scheduler; serialized cards reusable", async () => {
  const { lib } = await fixture();
  lib.words.forEach((w, i) => (w.practice = i === 0));
  const q = questions(lib, "spelling")[0];
  recordAnswer(lib, q, 3, q.expected, true);
  assert.equal(lib.cards.length, 1);
  assert.equal(questions(lib, "meaning").length, 1);
  assert.equal(questions(lib, "spelling").length, 0);
  const restored = JSON.parse(JSON.stringify(lib));
  validateLibrary(restored);
  recordAnswer(
    restored,
    questions(restored, "spelling", true)[0],
    1,
    "wrong",
    false,
  );
  assert.equal(restored.reviews.length, 2);
  recordAnswer(
    restored,
    questions(restored, "copy", true)[0],
    3,
    q.expected,
    true,
  );
  assert.equal(restored.cards.length, 1);
  assert.equal(restored.reviews.length, 3);
});
test("strict spelling keeps accent mistakes", () => {
  assert.deepEqual(checkAnswer("etudiante", "étudiante"), {
    correct: false,
    accentOnly: true,
  });
  assert.equal(checkAnswer("étudiante", "étudiante").correct, true);
  assert.equal(checkAnswer("où", "ou").correct, false);
});
test("saved confusion relation outranks low string similarity", () => {
  const l = emptyLibrary();
  applyImport(l, [["demain"], ["main"], ["semaine"], ["xyz"]], ["word"]);
  l.groups.push({
    id: uid(),
    name: "manual",
    notes: "",
    wordIds: [l.words[0].id, l.words[3].id],
    updatedAt: new Date().toISOString(),
  });
  const q = similarWords(l, l.words[0]);
  assert.equal(q[0].word.word, "xyz");
  assert.ok(q.some((x) => x.word.word === "main"));
});
test("SQLite roundtrip, safe SQL text, async mutation, stale-save guard, deletion, restore", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-test-"));
  try {
    const s = new Store(root);
    let l = await s.load();
    assert.equal(l.words.length, 0);
    await s.mutate((l) => {
      applyImport(
        l,
        [["l'ami; DROP TABLE words;--", "n.m.", "", "friend", "朋友"]],
        ["word", "pos", "ipa", "en", "zh"],
      );
    });
    l = await s.load();
    const first = l.words[0];
    await s.updateWord(first.id, async (w) => {
      await Promise.resolve();
      w.notes = "# Markdown\n\n**bold**";
    });
    assert.equal((await s.load()).words[0].notes, "# Markdown\n\n**bold**");
    const stale = await s.load();
    await s.updateWord(first.id, (w) => {
      w.familiarity = "fuzzy";
    });
    await assert.rejects(
      s.save(stale, stale.revision, stale.libraryId),
      /changed/,
    );
    await s.mutate((l) => {
      l.groups.push({
        id: uid(),
        name: "test",
        notes: "",
        wordIds: [first.id],
        updatedAt: new Date().toISOString(),
      });
    });
    await s.mutate((l) => {
      l.groups = [];
    });
    assert.equal((await s.load()).groups.length, 0);
    const backup = await s.backupLocal();
    await s.updateWord(first.id, (w) => {
      w.archived = true;
    });
    await s.restoreFile(backup);
    assert.equal((await s.load()).words[0].archived, false);
    const integrity = await sqlite(s.path, "PRAGMA integrity_check;", true);
    assert.equal(JSON.parse(integrity)[0].integrity_check, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("malformed backups rejected before writes", () => {
  assert.throws(() => validateLibrary({ version: 2 }));
  const l = emptyLibrary();
  (l as any).words = [{ id: "bad" }];
  assert.throws(() => validateLibrary(l));
});
