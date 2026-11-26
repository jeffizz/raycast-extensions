import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, newWord, now, validateLibrary } from "../src/core/model";
import { candidateSense, parseCandidates } from "../src/ai/core";
import {
  familyKey,
  familyMatchKey,
  familyMatchBatch,
  compatibleFamilySenses,
  familyMatches,
  familyRelations,
  saveFamily,
} from "../src/ai/family";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";
const candidate = {
  headword: "lavage",
  onset: "consonant",
  pos: "n.m.",
  ipa: "la.vaʒ",
  zh: "清洗",
  en: "washing",
  text: "洗这个动作的名词",
};
const source = {
  kind: "ai" as const,
  provider: "test",
  model: "test",
  at: now(),
};
function sample() {
  const lib = emptyLibrary();
  const word = newWord(
    "laver",
    candidateSense({ pos: "v.t.", ipa: "la.ve", zh: "洗", en: "wash" }),
  );
  lib.words.push(word);
  return { lib, word, senseId: word.senses[0].id };
}
test("family matching preserves accents and pronominal forms and includes archived entries", () => {
  assert.equal(familyKey(" S’apercevoir "), familyKey("s'apercevoir"));
  assert.notEqual(familyKey("retraité"), familyKey("retraite"));
  assert.notEqual(familyKey("se laver"), familyKey("laver"));
  const { lib } = sample();
  lib.words[0].archived = true;
  assert.equal(familyMatches(lib, " LAVER ").length, 1);
  assert.deepEqual(parseCandidates('{"items":[]}', "family"), []);
  assert.throws(() =>
    parseCandidates('{"items":[{"headword":"https://example.com"}]}', "family"),
  );
  assert.equal(
    parseCandidates(JSON.stringify({ items: [candidate] }), "family")[0]
      .headword,
    "lavage",
  );
});
test("batch matching collects exact and annotated forms without changing records", () => {
  const { lib, word, senseId } = sample();
  const adj = { ...candidate, headword: "suivant", pos: "adj." };
  const prep = newWord(
    "suivant",
    candidateSense({ ...candidate, pos: "prép." }),
  );
  const variant = newWord("suivant(e)", candidateSense(adj));
  lib.words.push(prep, variant);
  for (const form of ["suivant(e)(s)", "suivant,e,s", "suivant（e）"])
    assert.equal(familyMatchKey(form), "suivant");
  for (const form of ["acteur,trice", "mot(sens)", "aller, venir"])
    assert.equal(familyMatchKey(form), familyKey(form));
  assert.notEqual(familyMatchKey("retraité"), familyMatchKey("retraite"));
  const matches = familyMatchBatch(lib, ["suivant"]).get("suivant")!;
  assert.deepEqual(matches, [prep, variant]);
  assert.equal(matches[1], variant);
  assert.equal(compatibleFamilySenses(prep, "adj.").length, 0);
  assert.equal(compatibleFamilySenses(variant, "adj.").length, 1);
  assert.throws(
    () =>
      saveFamily(
        lib,
        word,
        senseId,
        [
          {
            candidate: adj,
            existingId: prep.id,
            targetSenseId: prep.senses[0].id,
          },
        ],
        source,
      ),
    /matching part/,
  );
  assert.throws(
    () =>
      saveFamily(
        lib,
        word,
        senseId,
        [{ candidate: adj, existingId: variant.id }],
        source,
      ),
    /matching part/,
  );
  assert.throws(
    () => saveFamily(lib, word, senseId, [{ candidate: adj }], source),
    /now exists/,
  );
  saveFamily(
    lib,
    structuredClone(word),
    senseId,
    [
      {
        candidate: adj,
        existingId: variant.id,
        targetSenseId: variant.senses[0].id,
      },
    ],
    source,
  );
  assert.equal(word.familyLinks![0].targetWordId, variant.id);
  assert.equal(variant.word, "suivant(e)");
});
test("complete irregular annotations match existing senses without permitting duplicate creation", () => {
  const { lib, word, senseId } = sample();
  const incoming = { ...candidate, headword: "nouveau", pos: "adj." };
  const existing = newWord("nouveau(nouvelle)", candidateSense(incoming));
  lib.words.push(existing);
  for (const spelling of [
    "nouveau(nouvelle)",
    "NOUVEAU（nouvelle）",
    "nouveau(nouvelle)(s)",
    "nouveau(nouvelle),s",
  ])
    assert.equal(familyMatchKey(spelling), "nouveau");
  assert.equal(familyMatchKey("beau(belle)"), "beau");
  for (const spelling of [
    "nouveau(sens)",
    "nouveau(nouvelle)(note)",
    "mot(autre)",
    "renouveler(se)",
  ])
    assert.equal(familyMatchKey(spelling), familyKey(spelling));
  assert.deepEqual(familyMatches(lib, "nouveau"), [existing]);
  assert.equal(
    compatibleFamilySenses(existing, "adj.")[0].id,
    existing.senses[0].id,
  );
  assert.throws(
    () => saveFamily(lib, word, senseId, [{ candidate: incoming }], source),
    /now exists/,
  );
  saveFamily(
    lib,
    word,
    senseId,
    [
      {
        candidate: incoming,
        existingId: existing.id,
        targetSenseId: existing.senses[0].id,
      },
    ],
    source,
  );
  assert.equal(word.familyLinks![0].targetWordId, existing.id);
  assert.equal(existing.word, "nouveau(nouvelle)");
});
test("batch matching retains only requested hits across repeated large-library scans", () => {
  const { lib } = sample();
  const template = lib.words[0];
  for (let i = 0; i < 20000; i++)
    lib.words.push({ ...template, id: String(i), word: "unrelated" + i });
  for (let run = 0; run < 20; run++) {
    const result = familyMatchBatch(lib, ["laver", "missing"]);
    assert.equal(result.size, 2);
    assert.equal(result.get("laver")!.length, 1);
    assert.equal(result.get("missing")!.length, 0);
  }
});
test("new words link by sense in both directions without altering learning or existing senses", () => {
  const { lib, word, senseId } = sample();
  const previous = structuredClone(word.senses);
  saveFamily(lib, structuredClone(word), senseId, [{ candidate }], source);
  const target = lib.words[1];
  assert.deepEqual(word.senses, previous);
  assert.equal(target.senses[0].source?.kind, "ai");
  assert.equal(familyRelations(lib, word.id, senseId)[0].word.id, target.id);
  assert.equal(
    familyRelations(lib, target.id, target.senses[0].id)[0].word.id,
    word.id,
  );
  assert.equal(familyRelations(lib, word.id, "another-sense").length, 0);
  assert.deepEqual(lib.cards, []);
  assert.deepEqual(lib.reviews, []);
  validateLibrary(lib);
});
test("same-batch headwords share one word with distinct senses and stable links", () => {
  const { lib, word, senseId } = sample();
  const adjective = {
    ...candidate,
    headword: "retraité",
    pos: "adj.",
    zh: "退休的",
    en: "retired",
  };
  const noun = {
    ...candidate,
    headword: " RETRAITÉ ",
    pos: "n.",
    zh: "退休者",
    en: "retiree",
  };
  saveFamily(
    lib,
    structuredClone(word),
    senseId,
    [{ candidate: adjective }, { candidate: noun }, { candidate: adjective }],
    source,
  );
  assert.equal(lib.words.length, 2);
  const target = lib.words[1];
  assert.equal(target.senses.length, 2);
  assert.equal(new Set(target.senses.map((s) => s.id)).size, 2);
  assert.equal(word.familyLinks?.length, 2);
  for (const sense of target.senses) {
    assert.equal(familyRelations(lib, target.id, sense.id)[0].word.id, word.id);
  }
  validateLibrary(lib);
});
test("existing words can only be linked and saves recheck duplicates and stale senses", () => {
  const { lib, word, senseId } = sample();
  const existing = newWord(
    "lavage",
    candidateSense({ ...candidate, zh: "不同的中文描述" }),
  );
  existing.archived = true;
  lib.words.push(existing);
  const before = structuredClone(existing);
  assert.throws(
    () => saveFamily(lib, word, senseId, [{ candidate }], source),
    /now exists/,
  );
  saveFamily(
    lib,
    structuredClone(word),
    senseId,
    [
      {
        candidate,
        existingId: existing.id,
        targetSenseId: existing.senses[0].id,
      },
    ],
    source,
  );
  saveFamily(
    lib,
    structuredClone(word),
    senseId,
    [
      {
        candidate,
        existingId: existing.id,
        targetSenseId: existing.senses[0].id,
      },
    ],
    source,
  );
  assert.deepEqual(existing, before);
  assert.equal(word.familyLinks?.length, 1);
  const stale = structuredClone(word);
  word.senses[0].zh = "changed";
  assert.throws(
    () =>
      saveFamily(
        lib,
        stale,
        senseId,
        [{ candidate, existingId: existing.id }],
        source,
      ),
    /changed/,
  );
});
test("family links survive content transactions, delta replay and SQLite snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-family-"));
  try {
    const db = new Store(root);
    const { word } = sample();
    await db.mutate((lib) => lib.words.push(word));
    const before = await db.load(false);
    await db.mutateContent(before.libraryId, (lib) =>
      saveFamily(lib, word, word.senses[0].id, [{ candidate }], source),
    );
    const after = await db.load(false);
    validateLibrary(after);
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
    await db.exportSQLite(join(root, "snapshot.sqlite"));
    const restored = await readSQLiteBackup(
      await readFile(join(root, "snapshot.sqlite")),
    );
    assert.deepEqual(restored.words, after.words);
    assert.equal(
      familyRelations(restored, word.id, word.senses[0].id).length,
      1,
    );
    const revision = after.revision;
    await assert.rejects(
      db.mutateContent(after.libraryId, (lib) =>
        saveFamily(lib, word, word.senses[0].id, [{ candidate }], source),
      ),
      /now exists/,
    );
    assert.equal((await db.load(false)).revision, revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
