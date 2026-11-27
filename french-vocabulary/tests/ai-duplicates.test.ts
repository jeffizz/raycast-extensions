import test from "node:test";
import { readFileSync } from "node:fs";
test("candidate rows use hover icons and preserve the original detail preview", () => {
  const source = readFileSync(
    new URL("../src/ai/workflow.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes('"Add / Save"'));
  assert.ok(source.includes('tooltip: "Possible Overlap"'));
  assert.ok(source.includes('tooltip: "Already Covered"'));
  assert.ok(!source.includes("## Save Action"));
  assert.ok(source.includes("## Existing Match"));
  const family = readFileSync(
    new URL("../src/ai/family-view.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(family.includes("tooltip: linked"));
  assert.ok(!family.includes("text: linked"));
});
import assert from "node:assert/strict";
import { emptyLibrary, newWord } from "../src/core/model";
import { candidateSense, parseCandidates, instruction } from "../src/ai/core";
import { duplicateContext, candidateMatch } from "../src/ai/duplicates";
import { saveAI } from "../src/ai/save";
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
test("sense candidates recognize known annotations without merging different constructions", () => {
  for (const [stored, lemma] of [
    ["aller (à)", "aller"],
    ["décider (de + inf.)", "décider"],
    ["fictif(ve)", "fictif"],
    ["gentil(le)", "gentil"],
    ["régulier(ère)", "régulier"],
    ["ami(s)", "ami"],
    ["ami(e)", "ami"],
    ["ami(es)", "ami"],
    ["gentil(les)", "gentil"],
    ["ami,e", "ami"],
    ["trouver(se)", "se trouver"],
    ["enfuir(s’)", "s'enfuir"],
  ]) {
    const w = { ...newWord(stored, candidateSense(base)), word: stored };
    assert.equal(
      candidateMatch({ ...base, headword: lemma }, w, "senses")?.senseId,
      w.senses[0].id,
      stored,
    );
    assert.equal(w.word, stored);
  }
  for (const [stored, candidate] of [
    ["aller (figuré)", "aller"],
    ["parler (à)", "parler (de)"],
    ["trouver(se)", "trouver"],
    ["trouver", "se trouver"],
    ["décider (de + inf.)", "decider"],
  ]) {
    const w = newWord(stored, candidateSense(base));
    assert.equal(
      candidateMatch(
        { ...base, headword: candidate, match: "equivalent", existingRef: "0" },
        w,
        "senses",
      ),
      undefined,
      stored,
    );
  }
});

test("an annotated headword with only a matching Chinese gloss is possible overlap", () => {
  const s = {
    pos: "v.i.",
    ipa: "a.le",
    zh: "适合，相配；合意",
    en: "to suit / to go well with",
  };
  const w = newWord("aller (à)", candidateSense(s));
  const match = candidateMatch(
    { ...s, en: "to suit somebody", headword: "aller" },
    w,
    "senses",
  );
  assert.equal(match?.status, "overlap");
  assert.equal(match?.senseId, w.senses[0].id);
});

test("an explicit update to an annotated pronominal word keeps its original spelling and sense ID", () => {
  const lib = emptyLibrary();
  const s = {
    pos: "v.pr.",
    ipa: "sə.tʁu.ve",
    zh: "位于",
    en: "to be situated",
  };
  const w = newWord("trouver(se)", candidateSense(s));
  lib.words.push(w);
  const id = w.senses[0].id;
  saveAI(lib, {
    word: structuredClone(w),
    spelling: w.word,
    task: "senses",
    items: [{ ...s, headword: "se trouver", en: "to be located" }],
    targets: [id],
  });
  assert.equal(lib.words.length, 1);
  assert.equal(w.word, "trouver(se)");
  assert.equal(w.senses[0].id, id);
  assert.equal(w.senses[0].en, "to be located");
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
