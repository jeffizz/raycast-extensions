import test from "node:test";
import assert from "node:assert/strict";
import { newWord } from "../src/core/model";
import { candidateSense, parseCandidates, instruction } from "../src/ai/core";
import { duplicateContext, candidateMatch } from "../src/ai/duplicates";
const base = { pos: "n.m.", ipa: "pla", zh: "菜肴，盘", en: "dish" };
const word = () => newWord("plat", candidateSense(base));
test("discovery remains primary and mixed matched/new results are preserved", () => {
  for (const task of ["senses", "collocations", "examples"] as const) {
    assert.match(instruction(task), /Generation is the primary task/);
    assert.match(instruction(task), /NOT an exhaustive dictionary/);
    assert.match(instruction(task), /never for novelty/);
    assert.match(instruction(task), /every returned candidate to match/);
    assert.match(instruction(task), /correct imprecise or mixed local wording/);
  }
  const w = word();
  const senses = parseCandidates(
    JSON.stringify({
      items: [
        { ...base, match: "equivalent", existingRef: "0" },
        { ...base, pos: "adj.", zh: "平淡的", en: "flat", match: "new" },
      ],
    }),
    "senses",
  );
  assert.equal(senses.length, 2);
  assert.equal(candidateMatch(senses[1], w, "senses"), undefined);
  const c = {
    pattern: "servir un plat",
    meaning: "端上一道菜",
    preposition: "",
    french: "Je sers un plat.",
    translation: "我端上一道菜。",
  };
  const collocations = parseCandidates(
    JSON.stringify({
      items: [
        { ...c, match: "equivalent", existingRef: "0" },
        { ...c, pattern: "un plat de qch", match: "new" },
      ],
    }),
    "collocations",
  );
  assert.equal(collocations.length, 2);
  assert.equal(collocations[1].match, "new");
});
test("duplicate advice references must resolve locally and exact matches remain detectable", () => {
  const w = word();
  const c = parseCandidates(
    JSON.stringify({
      items: [
        { ...base, zh: "菜肴，一盘菜", match: "equivalent", existingRef: "0" },
      ],
    }),
    "senses",
  )[0];
  assert.equal(candidateMatch(c, w, "senses")?.senseId, w.senses[0].id);
  assert.equal(candidateMatch(c, w, "senses")?.status, "equivalent");
  assert.equal(
    candidateMatch({ ...c, existingRef: "99" }, w, "senses"),
    undefined,
  );
  assert.equal(
    candidateMatch({ ...c, pos: "adj." }, w, "senses")?.status,
    "overlap",
  );
  assert.equal(
    candidateMatch({ ...c, match: "overlap" }, w, "senses")?.status,
    "overlap",
  );
  assert.equal(candidateMatch(base, w, "senses")?.status, "equivalent");
  assert.equal(
    candidateMatch({ ...c, headword: "se plat" }, w, "senses"),
    undefined,
  );
  assert.throws(() =>
    parseCandidates(
      JSON.stringify({ items: [{ ...base, match: "certain" }] }),
      "senses",
    ),
  );
});
test("duplicate context is bounded, sense-scoped and contains no notes or learning records", () => {
  const w = word();
  w.notes = "private";
  w.mnemonic = "private";
  w.examples = [
    {
      id: "e",
      senseId: w.senses[0].id,
      french: "Un plat.",
      translation: "一道菜。",
    },
    { id: "other", senseId: "other", french: "Secret", translation: "Secret" },
  ];
  w.collocationEntries = [];
  const context = duplicateContext(w, "examples", w.senses[0].id);
  assert.equal(context.length, 1);
  assert.equal(context[0].ref, "0");
  assert.ok(!JSON.stringify(context).includes("private"));
  assert.ok(!JSON.stringify(context).includes("Secret"));
  assert.equal(
    candidateMatch({ french: "Un plat." }, w, "examples", w.senses[0].id)
      ?.status,
    "equivalent",
  );
  assert.equal(
    candidateMatch({ french: "Un bon plat." }, w, "examples", w.senses[0].id),
    undefined,
  );
  w.senses = Array.from({ length: 40 }, (_, i) => ({
    ...candidateSense(base),
    zh: "x".repeat(1000) + i,
  }));
  assert.equal(duplicateContext(w, "senses").length, 32);
  assert.equal(duplicateContext(w, "senses")[0].zh.length, 240);
  assert.match(instruction("collocations"), /same abstract construction/);
});
