import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { saveAI } from "../src/ai/save";
import { parseCandidates } from "../src/ai/core";
test("AI onset is validated, persisted and only fills unknown onset on updates", () => {
  const noun = {
    pos: "n.m.",
    ipa: "a.mi",
    zh: "朋友",
    en: "friend",
    onset: "vowel",
  };
  for (const task of ["senses", "family"] as const) {
    const item = { ...noun, headword: "ami", text: "Related word" };
    assert.equal(
      parseCandidates(JSON.stringify({ items: [item] }), task)[0].onset,
      "vowel",
    );
    assert.throws(
      () =>
        parseCandidates(
          JSON.stringify({ items: [{ ...item, onset: "invalid" }] }),
          task,
        ),
      /Invalid onset/,
    );
    assert.equal(
      parseCandidates(
        JSON.stringify({ items: [{ ...item, onset: undefined }] }),
        task,
      )[0].onset,
      "unknown",
    );
  }
  const lib = emptyLibrary();
  saveAI(lib, { spelling: "ami", task: "senses", items: [noun], targets: [] });
  const word = lib.words[0],
    id = word.senses[0].id;
  assert.equal(word.senses[0].gender, "m");
  assert.equal(word.senses[0].onset, "vowel");
  saveAI(lib, {
    word: structuredClone(word),
    spelling: "ami",
    task: "senses",
    items: [{ ...noun, onset: "consonant" }],
    targets: [id],
  });
  assert.equal(word.senses[0].onset, "vowel");
  word.senses[0].onset = "unknown";
  saveAI(lib, {
    word: structuredClone(word),
    spelling: "ami",
    task: "senses",
    items: [noun],
    targets: [id],
  });
  assert.equal(word.senses[0].onset, "vowel");
  assert.equal(word.senses[0].id, id);
  validateLibrary(lib);
});
const ordinary = { pos: "v.t.", ipa: "la.ve", zh: "洗", en: "wash" };
const reflexive = {
  ...ordinary,
  headword: "se laver",
  ipa: "sə.la.ve",
  zh: "洗自己",
  en: "wash oneself",
};
test("pronominal senses split by default, deduplicate, and preserve the base sense", () => {
  const lib = emptyLibrary();
  saveAI(lib, {
    spelling: "laver",
    task: "senses",
    items: [ordinary],
    targets: [],
  });
  const base = lib.words[0];
  const id = base.senses[0].id;
  saveAI(lib, {
    word: structuredClone(base),
    spelling: "laver",
    task: "senses",
    items: [reflexive],
    targets: [id],
  });
  assert.equal(base.senses[0].id, id);
  assert.equal(base.senses.length, 1);
  assert.equal(lib.words[1].word, "se laver");
  saveAI(lib, {
    word: structuredClone(base),
    spelling: "laver",
    task: "senses",
    items: [reflexive],
    targets: [],
  });
  assert.equal(lib.words.length, 2);
  assert.equal(lib.words[1].senses.length, 1);
  validateLibrary(lib);
});
test("toggle retains pronominal sense in the base word", () => {
  const lib = emptyLibrary();
  saveAI(lib, {
    spelling: "laver",
    task: "senses",
    items: [ordinary, reflexive],
    targets: [],
    separatePronominal: false,
  });
  assert.equal(lib.words.length, 1);
  assert.equal(lib.words[0].senses.length, 2);
});
test("pronominal-only new entries leave no empty headword and parse explicit forms", () => {
  const lib = emptyLibrary();
  const items = parseCandidates(
    JSON.stringify({ items: [reflexive] }),
    "senses",
  );
  assert.equal(items[0].headword, "se laver");
  saveAI(lib, { spelling: "laver", task: "senses", items, targets: [] });
  assert.equal(lib.words.length, 1);
  assert.equal(lib.words[0].word, "se laver");
  validateLibrary(lib);
});
