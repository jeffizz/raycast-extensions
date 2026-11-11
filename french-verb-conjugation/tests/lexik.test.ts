import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { book } from "../src/data";
import { findVerbMatches, lookupCell, lookupInflectedForm } from "../src/lexik";
import { gradeAnswer, tableMarkdown } from "../src/model";

const assets = join(process.cwd(), "assets");

test("peut resolves to pouvoir and highlights its present third-person cell", async () => {
  const results = await findVerbMatches(book, "peut", assets);
  const match = results.find((result) => result.infinitive === "pouvoir");
  assert.ok(match);
  assert.deepEqual(match.matchedCells, [{ tense: 0, person: 2, form: "peut" }]);
  const table = tableMarkdown("pouvoir", book.verbs.pouvoir, match.matchedCells);
  assert.match(table, /\| il \| \*\*peut\*\* \|/);
  assert.doesNotMatch(table, /【|】/);
});

test("conjugation table defaults to the first form and can display all alternatives", () => {
  const forms = book.verbs["préférer"];
  const single = tableMarkdown("préférer", forms);
  assert.match(single, /préférerai/);
  assert.doesNotMatch(single, /préfèrerai/);
  assert.match(tableMarkdown("préférer", forms, [], true), /préférerai \/ préfèrerai/);
  const variantParts = book.verbs["absoudre"];
  assert.match(tableMarkdown("absoudre", variantParts), /absoudre \(absous \/ absolvant\)/);
  assert.match(tableMarkdown("absoudre", variantParts, [], true), /absoudre \(absous \/ absout \/ absolvant\)/);
  assert.equal(gradeAnswer(forms.t[2][0], "préfèrerai"), "ok");
});

test("only tenses with hidden variants show an asterisk in single-form mode", () => {
  const single = tableMarkdown("préférer", book.verbs["préférer"]);
  const header = single.split("\n").find((line) => line.startsWith("|  |"));
  assert.equal(header, "|  | 现在时 | 未完成过去时 | 简单将来时\\* | 条件式现在时\\* | 虚拟式现在时 | 命令式 |");
  const all = tableMarkdown("préférer", book.verbs["préférer"], [], true);
  assert.doesNotMatch(all.split("\n").find((line) => line.startsWith("|  |"))!, /\\\*/);
  const noAlternates = tableMarkdown("être", book.verbs["être"]);
  assert.doesNotMatch(noAlternates.split("\n").find((line) => line.startsWith("|  |"))!, /\\\*/);
  const oneTense = tableMarkdown("pouvoir", book.verbs["pouvoir"]);
  assert.match(oneTense, /\| 现在时\\\* \|/);
});

test("alternate-form reverse lookup highlights the actual queried variant", () => {
  const forms = book.verbs["préférer"];
  const cells = [{ tense: 2, person: 0, form: "préfèrerai" }];
  const single = tableMarkdown("préférer", forms, cells);
  assert.match(single, /\*\*préfèrerai\*\*/);
  assert.doesNotMatch(single, /\| préférerai \|/);
  const all = tableMarkdown("préférer", forms, cells, true);
  assert.match(all, /préférerai \/ \*\*préfèrerai\*\*/);
});

test("past and present participles find their lemma without highlighting", async () => {
  for (const word of ["fini", "finissant"]) {
    const results = await findVerbMatches(book, word, assets);
    const match = results.find((result) => result.infinitive === "finir");
    assert.ok(match, `${word} should resolve to finir`);
    assert.deepEqual(match.matchedCells, []);
  }
});

test("mange keeps all valid present, subjunctive and imperative cells", async () => {
  const match = (await findVerbMatches(book, "mange", assets)).find((result) => result.infinitive === "manger");
  assert.ok(match);
  const cells = match.matchedCells.map(({ tense, person }) => `${tense}:${person}`);
  for (const cell of ["0:0", "0:2", "4:0", "4:2", "5:1"]) assert.ok(cells.includes(cell), cell);
});

test("unsupported past tense resolves but does not highlight", async () => {
  const match = (await findVerbMatches(book, "parla", assets)).find((result) => result.infinitive === "parler");
  assert.ok(match);
  assert.deepEqual(match.matchedCells, []);
  assert.equal(lookupCell("Mood=Ind|Number=Sing|Person=3|Tense=Past|VerbForm=Fin"), null);
});

test("uppercase and decomposed input resolve through the real sqlite CLI", async () => {
  assert.ok((await lookupInflectedForm("PEUT", assets)).some((row) => row.lemma === "pouvoir"));
  assert.ok((await lookupInflectedForm("mange\u0301", assets)).some((row) => row.lemma === "manger"));
});

test("ambiguous forms preserve all available conjugation pages", async () => {
  const matches = await findVerbMatches(book, "suis", assets);
  assert.ok(matches.some((match) => match.infinitive === "être"));
  assert.ok(matches.some((match) => match.infinitive === "suivre"));
});
