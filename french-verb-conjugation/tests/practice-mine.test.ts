import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LocalStorage } from "@raycast/api";
import { expected, firstSlot, gridRows, pageForVerb, pageOf, pageSize, slotId, slotsForVerb } from "../src/practice-mine-model";
import { gradeAnswer, speechLines } from "../src/model";
import { book } from "../src/data";
import { incrementPractice, incrementPractices, loadStats } from "../src/mine";

test("pagination uses six verbs per page for verb columns and five for person columns", () => {
  const verbs = ["être", "avoir", "aller", "faire", "dire", "voir", "venir"];
  assert.equal(pageSize("tenses"), 6);
  assert.equal(pageSize("persons"), 5);
  assert.deepEqual(pageOf(verbs, 0, "tenses"), verbs.slice(0, 6));
  assert.deepEqual(pageOf(verbs, 1, "tenses"), ["venir"]);
  assert.deepEqual(pageOf(verbs, 0, "persons"), verbs.slice(0, 5));
  assert.deepEqual(pageOf(verbs, 1, "persons"), ["voir", "venir"]);
  assert.deepEqual(pageOf(verbs, 2, "persons"), []);
  assert.deepEqual(pageOf(verbs.slice(0, 5), 0, "persons"), verbs.slice(0, 5));
  assert.deepEqual(pageOf(verbs.slice(0, 5), 1, "persons"), []);
});

test("switching layout navigates to the page containing the selected verb", () => {
  const verbs = Array.from({ length: 16 }, (_, index) => `verb${index}`);
  for (const name of verbs) {
    for (const layout of ["persons", "tenses"] as const) {
      assert.ok(pageOf(verbs, pageForVerb(verbs, name, layout), layout).includes(name));
    }
  }
  assert.equal(pageForVerb(verbs, "verb5", "tenses"), 0);
  assert.equal(pageForVerb(verbs, "verb5", "persons"), 1);
  assert.equal(pageForVerb(verbs, "verb15", "tenses"), 2);
  assert.equal(pageForVerb(verbs, "verb15", "persons"), 3);
});

test("layouts transpose the same six persons and verbs", () => {
  const verbs = ["être", "avoir"];
  const columns = gridRows(verbs, 0, "tenses");
  const persons = gridRows(verbs, 0, "persons");
  assert.equal(columns.length, 6);
  assert.equal(columns[0].length, 2);
  assert.equal(persons.length, 2);
  assert.equal(persons[0].length, 6);
  for (let row = 0; row < 6; row++) for (let verb = 0; verb < 2; verb++) {
    assert.deepEqual(columns[row][verb], persons[verb][row]);
  }
  assert.equal(gridRows(verbs, "parts", "tenses").length, 2);
  assert.equal(gridRows(verbs, "parts", "persons")[0].length, 2);
});

test("slot identity includes verb, mode and person", () => {
  const present = { verb: "être", mode: 0 as const, row: 0 };
  assert.notEqual(slotId(present), slotId({ ...present, mode: 1 }));
  assert.notEqual(slotId(present), slotId({ ...present, row: 1 }));
  assert.notEqual(slotId(present), slotId({ ...present, verb: "avoir" }));
  assert.deepEqual(expected(present), ["suis"]);
  assert.equal(expected({ verb: "être", mode: 5, row: 0 }), null);
  assert.equal(firstSlot(["être"], 5).row, 1);
  assert.deepEqual(expected({ verb: "être", mode: "parts", row: 0 }), ["été"]);
  assert.deepEqual(expected({ verb: "être", mode: "parts", row: 1 }), ["étant"]);
  assert.equal(slotsForVerb("être", "parts").length, 2);
});

test("grading preserves alternate spellings and speech follows the chosen mode", () => {
  const future = expected({ verb: "connaître", mode: 2, row: 0 });
  assert.equal(gradeAnswer(future, "connaîtrai"), "ok");
  assert.equal(gradeAnswer(future, "connaitrai"), "ok");
  assert.equal(gradeAnswer(future, "connaistrais"), "bad");
  assert.equal(gradeAnswer(future, ""), "empty");
  const lines = speechLines("être", book.verbs["être"], false);
  assert.ok(lines.find((line) => line.id === "part")?.speech.includes("été"));
  assert.ok(lines.find((line) => line.id === "t2")?.speech.includes("serai"));
});

test("statistics increment once per filled verb and concurrent checks do not lose updates", async () => {
  await LocalStorage.setItem("practice-stats", "{}");
  await Promise.all([incrementPractices(["être", "être", "avoir"]), incrementPractice("être")]);
  assert.deepEqual(await loadStats(), { être: 2, avoir: 1 });
});
