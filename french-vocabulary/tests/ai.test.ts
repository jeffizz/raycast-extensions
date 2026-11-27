import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateSense,
  comparisonInput,
  instruction,
  parseCandidates,
  safeVocabulary,
} from "../src/ai/core";
import { candidateSaveSummary, saveAI } from "../src/ai/save";
import { emptyLibrary, newWord, uid } from "../src/core/model";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";
const item = {
  pos: "n.m.",
  ipa: "a.mi",
  zh: "friend in Chinese",
  en: "friend",
};
test("clipboard screen blocks typical secrets and accepts French phrases", () => {
  for (const text of [
    "sk-1234567890",
    "a@b.com",
    "https://example.com",
    "123456",
    "-----BEGIN PRIVATE KEY-----",
    "abc.def.ghi",
    "token secret",
    "x".repeat(101),
  ])
    assert.equal(safeVocabulary(text), "");
  for (const text of ["l'ami", "rendez-vous", "s'il vous plaît", "école"])
    assert.equal(safeVocabulary(text), text);
});
test("group comparison accepts selected words without a spelling field", () => {
  const first = newWord("ami", candidateSense(item));
  const second = newWord("copain", candidateSense(item));
  const unrelated = newWord("arbre", candidateSense(item));
  const words = [first, second, unrelated];
  assert.deepEqual(JSON.parse(comparisonInput(words, [first.id, second.id])), {
    words: [first, second].map(({ word }) => ({
      word,
      senses: [{ pos: item.pos, zh: item.zh, en: item.en }],
    })),
  });
  assert.throws(
    () => comparisonInput(words, [first.id, "missing"]),
    /Select 2–6/,
  );
});
test("comparison replaces old notes with the exact generated Markdown", () => {
  assert.match(instruction("comparison"), /Markdown pipe table/);
  assert.match(instruction("comparison"), /one word per row/);
  assert.match(instruction("comparison"), /at most 3 columns in any table/);
  assert.match(instruction("comparison"), /below the table/);
  const markdown = [
    "| 词语 | 核心区别 |",
    "| --- | --- |",
    "| ami | 朋友 |",
    "| copain | 伙伴，较口语 |",
    "",
    "- 日常语境中有时可以互换。",
  ].join("\n");
  const lib = emptyLibrary();
  const group = {
    id: uid(),
    name: "Friends",
    wordIds: [],
    notes: "Manual notes",
    updatedAt: new Date().toISOString(),
  };
  lib.groups.push(group);
  const items = parseCandidates(
    JSON.stringify({ items: [{ text: markdown }] }),
    "comparison",
  );
  saveAI(lib, {
    task: "comparison",
    spelling: "",
    items,
    targets: [],
    groupId: group.id,
    groupBefore: JSON.stringify(group),
    append: true,
  });
  assert.equal(group.notes, markdown);
});
test("candidate confirmation is short and distinguishes append from replace", () => {
  const options = {
    count: 1,
    replacements: 0,
    notesDestination: "group notes",
  } as const;
  assert.equal(
    candidateSaveSummary({ ...options, append: true }),
    "Selected candidates: 1.\nReplace group notes.",
  );
  assert.equal(
    candidateSaveSummary({ ...options, append: false }),
    "Selected candidates: 1.\nReplace group notes.",
  );
  assert.equal(
    candidateSaveSummary({
      ...options,
      notesDestination: "the word's mnemonic",
      append: true,
    }),
    "Selected candidates: 1.\nAppend to the word's mnemonic.",
  );
  const summary = candidateSaveSummary({
    count: 8,
    replacements: 3,
    append: true,
    collectionName: ("Collection\n" + "a".repeat(300)).repeat(3),
  });
  assert.match(summary, /Add: 5\. Replace: 3\./);
  assert.equal(summary.split("\n").length, 3);
  assert.ok(summary.length < 110);
  assert.ok(summary.endsWith("…"));
});
test("AI candidates enforce field, size and count bounds", () => {
  assert.deepEqual(
    parseCandidates(JSON.stringify({ items: [item] }), "senses"),
    [{ ...item, onset: "unknown" }],
  );
  assert.throws(() => parseCandidates('{"items":[]}', "senses"));
  assert.throws(() =>
    parseCandidates(JSON.stringify({ items: [{ pos: "n." }] }), "senses"),
  );
  assert.throws(() =>
    parseCandidates(JSON.stringify({ items: Array(9).fill(item) }), "senses"),
  );
  assert.throws(() =>
    parseCandidates(
      JSON.stringify({ items: [{ text: "x".repeat(6001) }] }),
      "mnemonic",
    ),
  );
});
test("AI saves preserve sense identity, manual notes and learning state", () => {
  const lib = emptyLibrary();
  const word = newWord("ami", candidateSense(item));
  lib.words.push(word);
  const original = structuredClone(word);
  saveAI(lib, {
    word: original,
    spelling: "ami",
    task: "senses",
    items: [{ ...item, en: "companion" }],
    targets: [word.senses[0].id],
  });
  assert.equal(word.senses[0].id, original.senses[0].id);
  assert.equal(word.senses[0].en, "companion");
  assert.throws(
    () =>
      saveAI(lib, {
        word: original,
        spelling: "ami",
        task: "senses",
        items: [item],
        targets: [],
      }),
    /changed/,
  );
  assert.equal(lib.cards.length, 0);
  assert.equal(lib.reviews.length, 0);
  assert.throws(
    () =>
      saveAI(lib, {
        spelling: "ami",
        task: "senses",
        items: [item],
        targets: [],
      }),
    /already exists/,
  );
  const current = structuredClone(word);
  saveAI(lib, {
    word: current,
    spelling: "ami",
    task: "mnemonic",
    items: [{ text: "Word family explanation" }],
    targets: [],
  });
  assert.equal(word.notes, "");
  assert.equal(word.mnemonic, "Word family explanation");
});
test("AI content writes avoid history and roundtrip through increments and SQLite", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-ai-"));
  try {
    const db = new Store(root);
    const before = await db.load();
    await db.mutateContent(before.libraryId, (lib) =>
      saveAI(lib, {
        spelling: "ami",
        task: "senses",
        items: [item],
        targets: [],
      }),
    );
    const after = await db.load();
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
    await db.exportSQLite(join(root, "ai.sqlite"));
    assert.deepEqual(
      await readSQLiteBackup(await readFile(join(root, "ai.sqlite"))),
      after,
    );
    await assert.rejects(
      db.mutateContent(uid(), () => {}),
      /Library changed/,
    );
    await assert.rejects(
      db.mutateContent(after.libraryId, (lib) => {
        lib.words = [];
        throw Error("rollback");
      }),
      /rollback/,
    );
    assert.deepEqual(await db.load(), after);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
