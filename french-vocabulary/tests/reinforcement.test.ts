import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  reinforcementState,
  reinforceAfterRecall,
  reinforceAfterChoice,
  reinforcementChoices,
} from "../src/core/reinforcement";

test("long sessions keep reinforcement spacing bounded and compact legacy progress", () => {
  const lib = emptyLibrary();
  let state = reinforcementState(lib);
  for (let i = 0; i < 500; i++)
    state = reinforceAfterRecall(state, `word-${i}`, true);
  for (let i = 500; i < 783; i++)
    state = reinforceAfterRecall(state, `word-${i}`, false);
  assert.equal(state.tasks.length, 500);
  assert.ok(state.tasks.every((task) => task.others.length === 5));
  state.tasks[0].others = Array.from({ length: 783 }, (_, i) => `legacy-${i}`);
  const compact = reinforcementState(lib, state);
  assert.equal(compact.tasks[0].others.length, 5);
  assert.equal(state.tasks[0].others.length, 783);
});

test("Again waits for five distinct other normal words; wrong choices restart spacing", () => {
  const lib = emptyLibrary();
  let state = reinforceAfterRecall(reinforcementState(lib), "target", true);
  assert.equal(state.tasks[0].others.length, 0);
  for (let i = 0; i < 10; i++) state = reinforceAfterRecall(state, "a", false);
  assert.equal(state.tasks[0].others.length, 1);
  for (const id of ["b", "c", "d", "e"])
    state = reinforceAfterRecall(state, id, false);
  assert.equal(state.tasks[0].others.length, 5);
  const before = JSON.stringify(state);
  const failed = reinforceAfterChoice(state, "target", false);
  assert.equal(failed.gap, 0);
  assert.deepEqual(failed.tasks[0].others, []);
  assert.equal(JSON.stringify(state), before);
  const passed = reinforceAfterChoice(state, "target", true);
  assert.equal(passed.tasks.length, 0);
  assert.deepEqual(
    reinforcementState(lib, JSON.parse(JSON.stringify(failed))),
    failed,
  );
  assert.equal(reinforcementState(emptyLibrary(), failed).tasks.length, 0);
});

test("choices deduplicate overlapping meanings and never mutate library or FSRS", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["chat", "n.m.", "猫", "cat"],
      ["chien", "n.m.", "狗", "dog"],
      ["livre", "n.m.", "书", "book"],
      ["arbre", "n.m.", "树", "tree"],
      ["félin", "n.m.", "猫", "cat"],
      ["vite", "adv.", "快", "quickly"],
    ],
    ["word", "pos", "zh", "en"],
  );
  const before = JSON.stringify(lib);
  const choices = reinforcementChoices(lib, lib.words[0], false, () => 0.5)!;
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map((c) => c.meaning)).size, 4);
  assert.ok(choices.some((c) => c.wordId === lib.words[0].id));
  assert.ok(!choices.some((c) => c.word === "vite" || c.word === "félin"));
  assert.equal(JSON.stringify(lib), before);
  lib.words[1].archived = true;
  assert.equal(reinforcementChoices(lib, lib.words[0], false), undefined);
});

test("repeated Again resets only its task; choice answers do not count as normal cards", () => {
  const lib = emptyLibrary();
  let state = reinforceAfterRecall(reinforcementState(lib), "a", true);
  state = reinforceAfterRecall(state, "b", true);
  state = reinforceAfterRecall(state, "a", true);
  assert.equal(state.tasks.length, 2);
  assert.deepEqual(state.tasks.find((t) => t.wordId === "a")!.others, []);
  const next = reinforceAfterChoice(state, "a", false);
  assert.deepEqual(next.tasks.find((t) => t.wordId === "b")!.others, ["a"]);
  assert.equal(lib.cards.length, 0);
  assert.equal(lib.reviews.length, 0);
});
