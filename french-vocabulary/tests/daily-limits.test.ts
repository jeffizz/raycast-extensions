import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";
import { dailyUsage, limitDailyQueue } from "../src/core/daily-limits";
import { Store } from "../src/core/sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function library() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    Array.from({ length: 15 }, (_, i) => ["word" + i, "n.m.", "meaning"]),
    ["word", "pos", "en"],
  );
  return lib;
}
test("daily limits default to ten new cards per mode without altering FSRS or sources", () => {
  const lib = library();
  for (const mode of ["meaning", "spelling", "gender"] as const) {
    const queue = questions(lib, mode, true);
    const before = JSON.stringify(lib);
    assert.equal(limitDailyQueue(lib, mode, queue).length, 10);
    assert.equal(JSON.stringify(lib), before);
    const q = queue[0];
    recordAnswer(lib, q, 3, q.expected, true);
    recordAnswer(lib, q, 3, q.expected, true);
    const usage = dailyUsage(lib, mode);
    assert.equal(usage.newToday.size, 1);
    assert.equal(usage.reviews.size, 0);
    assert.equal(limitDailyQueue(lib, mode, queue.slice(1)).length, 9);
    lib.words.forEach((w) => (w.familiarity = "fuzzy"));
    assert.equal(
      limitDailyQueue(
        lib,
        mode,
        questions(lib, mode, true, undefined, "fuzzy"),
      ).filter((x) => x.id !== q.id).length,
      9,
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(dailyUsage(lib, mode, tomorrow).newToday.size, 0);
  }
});
test("review-first order, independent caps, pause and repeated reviews", () => {
  const lib = library();
  const queue = questions(lib, "meaning", true);
  recordAnswer(lib, queue[12], 3, "", true);
  lib.reviews[0].at = new Date(2000, 0, 1).toISOString();
  lib.settings = {
    practice: {
      meaning: {
        autoSpeak: false,
        scope: "default",
        wordIds: [],
        dailyNew: 2,
        dailyReview: 1,
      },
    },
  };
  let limited = limitDailyQueue(lib, "meaning", queue);
  assert.equal(limited.length, 3);
  assert.equal(limited[0].id, queue[12].id);
  recordAnswer(lib, queue[12], 3, "", true);
  assert.equal(dailyUsage(lib, "meaning").reviews.size, 1);
  assert.equal(limitDailyQueue(lib, "meaning", queue).length, 3);
  lib.settings.practice!.meaning!.dailyNew = 0;
  lib.settings.practice!.meaning!.dailyReview = 0;
  assert.equal(limitDailyQueue(lib, "meaning", queue.slice(0, 12)).length, 0);
  assert.equal(
    limitDailyQueue(lib, "copy", questions(lib, "copy", true)).length,
    15,
  );
});
test("daily settings persist and reject unsafe values while accepting old libraries", async () => {
  const lib = library();
  validateLibrary(lib);
  lib.settings = {
    practice: {
      spelling: {
        autoSpeak: false,
        scope: "default",
        wordIds: [],
        dailyNew: 5,
        dailyReview: null,
      },
    },
  };
  validateLibrary(lib);
  const root = await mkdtemp(join(tmpdir(), "fv-daily-"));
  try {
    const db = new Store(root);
    await db.mutate((l) => {
      l.settings = lib.settings;
    });
    assert.equal(
      (await new Store(root).load()).settings?.practice?.spelling?.dailyNew,
      5,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  for (const bad of [-1, 1.5, NaN, 100001]) {
    lib.settings.practice!.spelling!.dailyNew = bad;
    assert.throws(() => validateLibrary(lib), /practice settings/);
  }
});
