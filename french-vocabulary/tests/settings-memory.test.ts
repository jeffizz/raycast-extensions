import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, sqlite } from "../src/core/sqlite";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";
import { baseline, makeDelta, applyDelta } from "../src/core/delta";

test("settings writes never load the library and preserve learning rows and backup revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-settings-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["ami"]], ["word"]);
      recordAnswer(lib, questions(lib, "meaning", true)[0], 3, "", true);
    });
    const before = await db.load();
    const originalLoad = db.load.bind(db);
    db.load = async () => {
      throw Error("Settings must not load history");
    };
    await db.updateSettings(before.libraryId, (lib) => {
      lib.settings = {
        practice: {
          meaning: {
            autoSpeak: true,
            scope: "default",
            wordIds: [],
            sourceFilters: {
              collectionId: "",
              collectionIds: [],
              pos: "all",
              familiarity: "fuzzy",
            },
          },
        },
      };
    });
    const after = await originalLoad();
    assert.equal(after.revision, before.revision + 1);
    for (const key of ["words", "cards", "reviews", "groups"] as const)
      assert.deepEqual(after[key], before[key]);
    assert.deepEqual(
      applyDelta(before, makeDelta(baseline(before), after)),
      after,
    );
    await assert.rejects(
      db.updateSettings("wrong-library", () => {}),
      /Library changed/,
    );
    await assert.rejects(
      db.updateSettings(before.libraryId, (lib) => {
        lib.settings = { backup: { fullHours: 0, incrementalMinutes: 5 } };
      }),
    );
    assert.deepEqual(await originalLoad(), after);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("practice reads all scheduling cards but only requested review dates without deleting history", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-practice-history-"));
  try {
    const db = new Store(root);
    await db.mutate((lib) => {
      applyImport(lib, [["ami"]], ["word"]);
      const q = questions(lib, "meaning", true)[0];
      recordAnswer(lib, q, 3, "", true);
      lib.reviews[0].at = "2026-11-22T12:00:00Z";
      recordAnswer(lib, q, 3, "", true);
      lib.reviews[1].at = "2026-11-23T12:00:00Z";
    });
    const before = await db.load();
    const recent = await db.load(true, "2026-11-23T05:00:00Z");
    assert.equal(recent.reviews.length, 1);
    assert.deepEqual(recent.cards, before.cards);
    assert.deepEqual(await db.load(), before);
    const header = await db.getMeta<{ libraryId: string }>("header");
    // Simulate an edit between reading and committing the settings header.
    const originalGet = db.getMeta.bind(db);
    db.getMeta = async <T>(key: string) => {
      const value = await originalGet<T>(key);
      await sqlite(
        db.path,
        "UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1) WHERE key='header';",
      );
      return value;
    };
    await assert.rejects(
      db.updateSettings(header!.libraryId, (lib) => {
        lib.settings = {};
      }),
    );
    assert.deepEqual((await db.load()).reviews, before.reviews);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
