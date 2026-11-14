import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary, validateLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { questions, recordAnswer } from "../src/core/learning";
import { modeSettings } from "../src/core/practice-settings";
import { applyDelta, baseline, makeDelta } from "../src/core/delta";
import { backupDue } from "../src/core/backup";

function sample() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["ami", "n.m.", "", "friend"],
      ["chat", "n.m.", "", "cat"],
    ],
    ["word", "pos", "ipa", "en"],
  );
  return lib;
}
test("mode selection and audio are independent, overridable and still respect global exclusions", () => {
  const lib = sample();
  const id = lib.words[0].id;
  lib.settings = {
    practice: {
      spelling: { autoSpeak: false, scope: "selected", wordIds: [id] },
      copy: { autoSpeak: true, scope: "default", wordIds: [] },
    },
  };
  assert.equal(questions(lib, "spelling", true).length, 1);
  assert.equal(questions(lib, "meaning", true).length, 2);
  assert.equal(modeSettings(lib, "copy").autoSpeak, true);
  assert.equal(modeSettings(lib, "spelling").autoSpeak, false);
  assert.equal(
    questions(lib, "spelling", true, undefined, "default").length,
    2,
  );
  assert.equal(questions(lib, "spelling", true, [lib.words[1].id]).length, 0);
  lib.words[0].practice = false;
  assert.equal(questions(lib, "spelling", true).length, 0);
  lib.words[0].practice = true;
  lib.words[0].archived = true;
  assert.equal(questions(lib, "spelling", true).length, 0);
  lib.settings.practice!.spelling!.wordIds = [];
  assert.equal(questions(lib, "spelling", true).length, 0);
});
test("delta round trip preserves settings, reviews, cards, edits, order and deletions", () => {
  const lib = sample();
  lib.groups.push({
    id: "g",
    name: "group",
    wordIds: lib.words.map((w) => w.id),
    notes: "",
    updatedAt: new Date().toISOString(),
  });
  const next = structuredClone(lib);
  next.words[0].notes = "中文 é 🐈";
  recordAnswer(next, questions(next, "spelling", true)[0], 1, "wrong", false);
  next.words.reverse();
  next.groups = [];
  next.settings = {
    practice: {
      spelling: {
        autoSpeak: false,
        scope: "selected",
        wordIds: [next.words[0].id],
      },
    },
  };
  next.revision++;
  const delta = makeDelta(baseline(lib), next);
  assert.equal(delta.changes.words.upsert.length, 1);
  assert.deepEqual(
    applyDelta(lib, JSON.parse(JSON.stringify(delta))),
    JSON.parse(JSON.stringify(next)),
  );
  assert.throws(() => applyDelta(next, delta), /chain/);
  const broken = structuredClone(delta);
  broken.changes.words.order.push("missing");
  assert.throws(() => applyDelta(lib, broken), /Missing/);
  const reset = {
    ...next,
    revision: next.revision + 1,
    words: [],
    groups: [],
    cards: [],
    reviews: [],
    settings: {},
  };
  assert.deepEqual(applyDelta(next, makeDelta(baseline(next), reset)), reset);
});
test("activity scheduling chooses initial full, interval increment, overdue full even unchanged", () => {
  const lib = sample();
  const at = Date.parse("2026-11-14T12:00:00Z");
  const state = {
    libraryId: lib.libraryId,
    revision: lib.revision,
    fullAt: new Date(at).toISOString(),
    at: new Date(at).toISOString(),
  };
  assert.equal(backupDue(lib, undefined, at), "full");
  assert.equal(backupDue(lib, state, at + 60000), undefined);
  lib.revision++;
  assert.equal(backupDue(lib, state, at + 299999), undefined);
  assert.equal(backupDue(lib, state, at + 300000), "incremental");
  lib.revision--;
  assert.equal(
    backupDue(
      lib,
      { ...state, cleanupPending: ["delta-old.json"] },
      at + 299999,
    ),
    undefined,
  );
  assert.equal(
    backupDue(
      lib,
      { ...state, cleanupPending: ["delta-old.json"] },
      at + 300000,
    ),
    "incremental",
  );
  assert.equal(backupDue(lib, state, at + 86400000), "full");
  lib.settings = { backup: { fullHours: 1, incrementalMinutes: 1 } };
  assert.equal(backupDue(lib, state, at + 3600000), "full");
  validateLibrary(lib);
});
