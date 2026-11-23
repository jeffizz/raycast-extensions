import test from "node:test";
import assert from "node:assert/strict";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  linkPracticeConfusion,
  confusionWordTitle,
} from "../src/core/practice-confusion";
import { questions, recordAnswer } from "../src/core/learning";

test("practice groups auto-name new and merged members without changing learning state", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["ami"], ["amie"], ["ennemi"]], ["word"]);
  recordAnswer(lib, questions(lib, "meaning", true)[0], 3, "", true);
  lib.words[1].practice = false;
  lib.words[2].archived = true;
  const before = JSON.stringify({
    words: lib.words,
    cards: lib.cards,
    reviews: lib.reviews,
    settings: lib.settings,
  });
  const [a, b, c] = lib.words.map((w) => w.id);
  const group = linkPracticeConfusion(lib, a, [b, b, a], "");
  assert.equal(group.name, "ami, amie");
  group.name = "Old custom name";
  group.notes = "Keep notes";
  const id = group.id;
  linkPracticeConfusion(lib, c, [b], id);
  assert.equal(group.id, id);
  assert.equal(group.notes, "Keep notes");
  assert.deepEqual(group.wordIds, [a, b, c]);
  assert.equal(group.name, "ami, amie, ennemi");
  linkPracticeConfusion(lib, a, [b], id);
  assert.equal(group.name, "ami, amie, ennemi");
  assert.equal(lib.groups.length, 1);
  assert.equal(
    JSON.stringify({
      words: lib.words,
      cards: lib.cards,
      reviews: lib.reviews,
      settings: lib.settings,
    }),
    before,
  );
  assert.equal(confusionWordTitle(lib, [a, a, b]), "ami, amie");
});
test("invalid links do not change groups", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["ami"], ["amie"]], ["word"]);
  const [a, b] = lib.words.map((w) => w.id);
  assert.throws(() => linkPracticeConfusion(lib, a, [], ""), /other word/);
  assert.throws(
    () => linkPracticeConfusion(lib, a, ["missing"], ""),
    /no longer exists/,
  );
  assert.throws(
    () => linkPracticeConfusion(lib, a, [b], "missing"),
    /no longer exists/,
  );
  assert.deepEqual(lib.groups, []);
});
