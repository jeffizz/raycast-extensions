import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Store, sqlite, sql } from "../src/core/sqlite";
import { applyImport } from "../src/core/importer";
import { emptyLibrary } from "../src/core/model";
import { detailMarkdown } from "../src/core/presentation";

test("large multibyte SQLite output stays lossless across stdout chunk boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-unicode-"));
  try {
    const path = join(root, "test.sqlite");
    const value = "中文释义：图表、名词，阳性。éœɑ̃🙂".repeat(18000);
    await sqlite(
      path,
      `CREATE TABLE t(value TEXT);INSERT INTO t VALUES(${sql(value)});`,
    );
    for (let i = 0; i < 3; i++) {
      const rows = JSON.parse(await sqlite(path, "SELECT value FROM t;", true));
      assert.equal(rows[0].value, value);
      assert.ok(!rows[0].value.includes("\uFFFD"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("reimport repairs only uniquely matched damaged field and preserves IDs/notes/progress", () => {
  const l = emptyLibrary();
  applyImport(
    l,
    [["ligne", "n.f.", "/liɲ/", "line", "����"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  const w = l.words[0],
    id = w.id,
    senseId = w.senses[0].id;
  w.notes = "keep notes";
  w.familiarity = "known";
  const result = applyImport(
    l,
    [["ligne", "n.f.", "/liɲ/", "line", "行；线"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  assert.equal(result.repaired, 1);
  assert.equal(w.senses.length, 1);
  assert.equal(w.id, id);
  assert.equal(w.senses[0].id, senseId);
  assert.equal(w.senses[0].zh, "行；线");
  assert.equal(w.notes, "keep notes");
  assert.equal(w.familiarity, "known");
});
test("compact details omit language labels and keep POS separate from the heading", () => {
  const l = emptyLibrary();
  applyImport(
    l,
    [["ligne", "n.f.", "/liɲ/", "line", "行；线"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  const w = l.words[0];
  const text = detailMarkdown(w);
  assert.ok(text.startsWith("# ligne\n"));
  assert.ok(!text.includes("**EN"));
  assert.ok(!text.includes("**CN"));
  assert.ok(!text.includes("/liɲ/"));
  w.senses[0].en = "";
  assert.ok(!detailMarkdown(w).includes("EN:"));
  assert.ok(detailMarkdown(w).includes("(n.f.)  \n行；线"));
});
test("1366-word library: targeted edits preserve unrelated data and skip history on browse load", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fv-bench-"));
  try {
    const store = new Store(root);
    await store.mutate((l) => {
      applyImport(
        l,
        Array.from({ length: 1366 }, (_, i) => [
          `mot${i}`,
          "n.m.",
          "/mo/",
          `word ${i}`,
          `中文含义 ${i}`,
        ]),
        ["word", "pos", "ipa", "en", "zh"],
      );
    });
    const start = performance.now();
    const before = await store.load(false);
    const loadMs = performance.now() - start;
    const edit = performance.now();
    await store.updateWord(before.words[700].id, (w) => {
      w.familiarity = "fuzzy";
    });
    const editMs = performance.now() - edit;
    const after = await store.load();
    assert.equal(after.words.length, 1366);
    assert.equal(after.words[700].familiarity, "fuzzy");
    assert.equal(after.words[0].senses[0].zh, "中文含义 0");
    assert.ok(after.words.every((w) => !JSON.stringify(w).includes("\uFFFD")));
    assert.equal(after.words[0].updatedAt, before.words[0].updatedAt);
    t.diagnostic(
      `1366 words: light load ${loadMs.toFixed(1)} ms; targeted update ${editMs.toFixed(1)} ms (database only, excludes Raycast rendering)`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("single-word update rejects concurrent content changes but preserves concurrent viewing", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-edit-"));
  try {
    const store = new Store(root);
    await store.mutate((l) => {
      applyImport(l, [["mot"]], ["word"]);
    });
    const id = (await store.load()).words[0].id;
    await store.updateWord(id, async (w) => {
      await store.touchWord(id);
      w.notes = "kept";
    });
    assert.ok((await store.load()).words[0].lastViewedAt);
    await assert.rejects(
      store.updateWord(id, async (w) => {
        await store.updateWord(id, (x) => {
          x.notes = "newer";
        });
        w.notes = "stale";
      }),
      /changed/,
    );
    assert.equal((await store.load()).words[0].notes, "newer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
