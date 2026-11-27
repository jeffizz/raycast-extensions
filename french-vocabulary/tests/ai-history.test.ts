import test from "node:test";
import assert from "node:assert/strict";
import { groundedHistory } from "../src/ai/citations";
import { saveAI } from "../src/ai/save";
import { candidateSense } from "../src/ai/core";
import { emptyLibrary, newWord } from "../src/core/model";
test("history requires executed search and clickable citations", () => {
  assert.throws(
    () =>
      groundedHistory([
        {
          type: "message",
          content: [{ type: "output_text", text: "Invented tale" }],
        },
      ]),
    /No web search/,
  );
  assert.throws(
    () =>
      groundedHistory([
        { type: "web_search_call" },
        {
          type: "message",
          content: [{ type: "output_text", text: "Unsourced" }],
        },
      ]),
    /No sourced/,
  );
  const result = groundedHistory([
    { type: "web_search_call" },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Documented.",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/source",
              start_index: 0,
              end_index: 11,
            },
          ],
        },
      ],
    },
  ]);
  assert.ok(result[0].text.includes("[1](https://example.com/source)"));
});
test("examples keep target meaning and group comparison replaces notes with stale-write protection", () => {
  const lib = emptyLibrary();
  const w = newWord(
    "ami",
    candidateSense({ pos: "n.m.", ipa: "a.mi", zh: "friend", en: "friend" }),
  );
  lib.words.push(w);
  const original = structuredClone(w);
  saveAI(lib, {
    word: original,
    spelling: "ami",
    task: "examples",
    items: [{ french: "Mon ami arrive.", translation: "My friend arrives." }],
    targets: [],
    senseId: w.senses[0].id,
  });
  assert.equal(w.examples[0].senseId, w.senses[0].id);
  const group = {
    id: "g",
    name: "Group",
    wordIds: [w.id],
    notes: "Original",
    updatedAt: "",
  };
  lib.groups.push(group);
  const before = JSON.stringify(group);
  saveAI(lib, {
    spelling: "",
    task: "comparison",
    items: [{ text: "New comparison" }],
    targets: [],
    groupId: "g",
    groupBefore: before,
    append: true,
  });
  assert.equal(group.notes, "New comparison");
  assert.throws(
    () =>
      saveAI(lib, {
        spelling: "",
        task: "comparison",
        items: [{ text: "Stale" }],
        targets: [],
        groupId: "g",
        groupBefore: before,
      }),
    /Group changed/,
  );
});
