import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/sqlite";
import { questions, recordAnswer } from "../src/core/learning";
import { applyImport } from "../src/core/importer";
import { compactCopyQueue } from "../src/core/copy-session";

test("recall progress persists independently with question and sense identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-recall-session-"));
  try {
    const store = new Store(root);
    await store.mutate((lib) =>
      applyImport(
        lib,
        [
          ["ami", "n.m.", "friend"],
          ["table", "n.f.", "table"],
        ],
        ["word", "pos", "en"],
      ),
    );
    for (const mode of ["meaning", "spelling", "gender"] as const) {
      const lib = await store.load();
      const queue = questions(lib, mode, true);
      const q = queue[0];
      await store.mutate((l) => recordAnswer(l, q, 1, "wrong", false));
      const snapshot = {
        libraryId: lib.libraryId,
        queue: compactCopyQueue(queue),
        index: 0,
        saved: [q.id],
        results: [{ correct: false, rating: 1 }],
        answer: "wrong",
        revealed: true,
      };
      await store.setMeta("practice-session-" + mode, snapshot);
      const reopened = new Store(root);
      const saved = await reopened.getMeta<typeof snapshot>(
        "practice-session-" + mode,
      );
      assert.deepEqual(saved, snapshot);
      const current = (await reopened.load()).words.find(
        (w) => w.id === saved!.queue[0].wordId,
      )!;
      if (mode === "gender")
        assert.ok(
          current.senses.some(
            (s) => current.id + ":gender:" + s.id === saved!.queue[0].id,
          ),
        );
      assert.ok(saved!.saved.includes(q.id));
      assert.equal(
        (await reopened.load()).reviews.filter((r) => r.mode === mode).length,
        1,
      );
    }
    for (const mode of ["meaning", "spelling", "gender"])
      assert.ok(await store.getMeta("practice-session-" + mode));
    await store.setMeta("practice-session-meaning", null);
    assert.equal(await store.getMeta("practice-session-meaning"), null);
    assert.ok(await store.getMeta("practice-session-gender"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
