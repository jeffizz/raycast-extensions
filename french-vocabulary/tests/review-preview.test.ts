import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyCard, fsrs } from "ts-fsrs";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  recallIntervalPreview,
  formatReviewDelay,
  questions,
  recordAnswer,
} from "../src/core/learning";
import { Store } from "../src/core/sqlite";

test("interval previews match FSRS for new and mature cards without mutating input", () => {
  const at = new Date("2026-11-22T17:00:00Z");
  const prior = new Date("2026-10-01T17:00:00Z");
  const matured = fsrs({ enable_fuzz: false }).repeat(
    createEmptyCard(prior),
    prior,
  )[4].card;
  for (const card of [undefined, JSON.parse(JSON.stringify(matured))]) {
    const before = JSON.stringify(card);
    const preview = recallIntervalPreview(card, at);
    const expected = fsrs({ enable_fuzz: false }).repeat(
      card ?? createEmptyCard(at),
      at,
    );
    assert.deepEqual(
      preview.map((p) => p.label),
      ["Again", "Hard", "Good", "Easy"],
    );
    for (const option of preview) {
      assert.equal(option.due, expected[option.rating].card.due.toISOString());
      assert.equal(
        option.delayMs,
        expected[option.rating].card.due.getTime() - at.getTime(),
      );
    }
    assert.equal(JSON.stringify(card), before);
  }
});
test("preview and real answer grading share the same schedule", () => {
  for (const grade of [1, 2, 3, 4] as const) {
    const lib = emptyLibrary();
    applyImport(lib, [["ami"]], ["word"]);
    const q = questions(lib, "meaning", true)[0];
    const preview = recallIntervalPreview(undefined);
    assert.equal(lib.cards.length, 0);
    assert.equal(lib.reviews.length, 0);
    recordAnswer(lib, q, grade, "", grade !== 1);
    assert.ok(
      Math.abs(
        Date.parse(String(lib.cards[0].card.due)) -
          Date.parse(preview[grade - 1].due),
      ) < 2000,
    );
    assert.equal(lib.reviews.length, 1);
  }
});
test("compact interval formatting covers minutes, hours and long review intervals", () => {
  assert.equal(formatReviewDelay(0), "<1m");
  assert.equal(formatReviewDelay(60000), "1m");
  assert.equal(formatReviewDelay(3600000), "1h");
  assert.equal(formatReviewDelay(86400000), "1d");
  assert.equal(formatReviewDelay(120 * 86400000), "120d");
});
test("single card lookup reads current state and leaves the library unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-preview-"));
  try {
    const store = new Store(root);
    await store.mutate((lib) => {
      applyImport(lib, [["ami"]], ["word"]);
      const q = questions(lib, "meaning", true)[0];
      recordAnswer(lib, q, 3, "", true);
    });
    const before = await store.load();
    assert.equal(await store.getPracticeCard("missing"), undefined);
    assert.deepEqual(
      await store.getPracticeCard(before.cards[0].id),
      before.cards[0],
    );
    recallIntervalPreview(
      (await store.getPracticeCard(before.cards[0].id))!.card,
    );
    assert.deepEqual(await store.load(), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
