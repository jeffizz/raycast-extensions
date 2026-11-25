import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { saveAI } from "../src/ai/save";
import { parseCandidates } from "../src/ai/core";
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
