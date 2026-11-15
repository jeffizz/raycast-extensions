import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { Store } from "../src/core/sqlite";
import {
  startProcessing,
  processingWords,
  finishProcessingWord,
  ProcessingSession,
} from "../src/core/processing";

test("processing keeps captured order despite edits, and only explicit done removes words", async () => {
  const lib = emptyLibrary();
  applyImport(lib, [["chat"], ["ami"], ["bonjour"]], ["word"]);
  const ordered = [...lib.words].reverse();
  let session = startProcessing(lib.libraryId, ordered);
  lib.words[0].practice = false;
  lib.words[0].familiarity = "known";
  assert.deepEqual(processingWords(lib, session), ordered);
  const original = structuredClone(lib);
  session = finishProcessingWord(session, ordered[0].id);
  session = finishProcessingWord(session, ordered[1].id);
  assert.deepEqual(processingWords(lib, session), [ordered[2]]);
  assert.deepEqual(lib, original);
  assert.equal(session.total, 3);
  const root = await mkdtemp(join(tmpdir(), "fv-processing-"));
  try {
    await new Store(root).setMeta("processing-active", session);
    const restored = await new Store(root).getMeta<ProcessingSession>(
      "processing-active",
    );
    assert.deepEqual(restored, session);
    assert.deepEqual(processingWords(lib, restored!), [ordered[2]]);
    assert.deepEqual(processingWords(emptyLibrary(), restored!), []);
    assert.deepEqual(
      processingWords(lib, finishProcessingWord(session, ordered[2].id)),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retention settings accept older libraries but reject unsafe counts", () => {
  const lib = emptyLibrary();
  lib.settings = { backup: { fullHours: 24, incrementalMinutes: 5 } };
  validateLibrary(lib);
  for (const retainFull of [0, -1, 1.5, 101, NaN]) {
    lib.settings.backup!.retainFull = retainFull;
    assert.throws(() => validateLibrary(lib), /backup/);
  }
  lib.settings.backup!.retainFull = 3;
  validateLibrary(lib);
});
