import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactCopyQueue, practiceWindow } from "../src/core/copy-session";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { copyQuestionsInOrder } from "../src/core/learning";
import { Store } from "../src/core/sqlite";

test("2500-word copy progress stores references rather than lexical payloads and survives reopening", async () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    Array.from({ length: 2500 }, (_, i) => ["word" + i]),
    ["word"],
  );
  for (const word of lib.words) word.notes = "Long lexical note ".repeat(100);
  const queue = copyQuestionsInOrder(lib, lib.words);
  const compact = compactCopyQueue(queue);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(queue).length / 10);
  assert.deepEqual(Object.keys(compact[0]), ["id", "wordId", "expected"]);
  const root = await mkdtemp(join(tmpdir(), "fv-copy-"));
  try {
    const progress = {
      libraryId: lib.libraryId,
      queue: compact,
      index: 1200,
      saved: [queue[1200].id],
      answer: "mistake",
      revealed: true,
    };
    await new Store(root).setMeta("copy-spelling-session", progress);
    assert.deepEqual(
      await new Store(root).getMeta("copy-spelling-session"),
      progress,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("legacy 5 MB progress metadata reads directly without nested JSON output", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-legacy-copy-"));
  try {
    const db = new Store(root);
    const legacy = {
      queue: Array.from({ length: 2500 }, (_, i) => ({
        id: String(i),
        word: { id: String(i), notes: "note".repeat(500) },
        expected: "word",
      })),
      index: 123,
    };
    await db.setMeta("copy-spelling-session", legacy);
    const start = performance.now();
    assert.deepEqual(await db.getMeta("copy-spelling-session"), legacy);
    const elapsed = performance.now() - start;
    console.log("Legacy 5 MB progress read: " + elapsed.toFixed(1) + " ms");
    assert.ok(
      elapsed < 5000,
      "legacy metadata must not take seconds to re-encode",
    );
    assert.equal(await db.getMeta("missing"), undefined);
    await db.setMeta("copy-spelling-session", null);
    assert.equal(await db.getMeta("copy-spelling-session"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("practice rendering remains bounded and always includes the current question", () => {
  for (const index of [0, 1, 79, 1200, 2499]) {
    const window = practiceWindow(index, 2500);
    assert.ok(window.end - window.start <= 80);
    assert.ok(window.start <= index && window.end > index);
  }
});
