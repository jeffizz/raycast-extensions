import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { saveAI } from "../src/ai/save";
import { parseCandidates, instruction } from "../src/ai/core";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";
const sense = { pos: "n.m.", ipa: "a.mi", zh: "朋友", en: "friend" };
const collocation = {
  pattern: "un ami proche",
  meaning: "亲密的朋友",
  preposition: "",
  french: "C'est un ami proche.",
  translation: "这是一位亲密的朋友。",
};
test("structured collocations retain IDs, target sense and legacy notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-content-"));
  try {
    const lib = emptyLibrary();
    saveAI(lib, {
      spelling: "ami",
      task: "senses",
      items: [sense],
      targets: [],
      provider: "gemini",
      model: "test-model",
    });
    const w = lib.words[0];
    assert.equal(w.senses[0].source?.kind, "ai");
    assert.equal(w.senses[0].source?.model, "test-model");
    w.collocations = "Legacy Markdown";
    w.notes = "Keep notes";
    const before = structuredClone(lib);
    const options = {
      word: structuredClone(w),
      spelling: "ami",
      task: "collocations" as const,
      items: parseCandidates(
        JSON.stringify({ items: [collocation] }),
        "collocations",
      ),
      targets: [],
      senseId: w.senses[0].id,
    };
    saveAI(lib, options);
    const id = w.collocationEntries![0].id;
    saveAI(lib, { ...options, word: structuredClone(w) });
    assert.equal(w.collocationEntries!.length, 1);
    assert.equal(w.collocationEntries![0].id, id);
    assert.equal(w.collocationEntries![0].senseId, w.senses[0].id);
    assert.equal(w.notes, "Keep notes");
    assert.equal(w.collocations, "Legacy Markdown");
    lib.revision = before.revision + 1;
    validateLibrary(lib);
    assert.deepEqual(applyDelta(before, makeDelta(baseline(before), lib)), lib);
    const db = new Store(root);
    await db.mutate((l) => {
      l.words = structuredClone(lib.words);
    });
    await db.exportSQLite(join(root, "snapshot.sqlite"));
    assert.deepEqual(
      (await readSQLiteBackup(await readFile(join(root, "snapshot.sqlite"))))
        .words,
      JSON.parse(JSON.stringify(lib.words)),
    );
    const invalid = structuredClone(lib);
    invalid.words[0].collocationEntries![0].source.kind = "bad" as "ai";
    assert.throws(() => validateLibrary(invalid));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("mnemonic prompt requests brief cues and collocations require structured fields", () => {
  assert.match(instruction("mnemonic"), /1–2 extremely short/);
  assert.throws(() =>
    parseCandidates('{"items":[{"text":"Old Markdown"}]}', "collocations"),
  );
});
