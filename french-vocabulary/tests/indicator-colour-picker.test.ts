import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultIndicatorColors,
  indicatorColors,
} from "../src/core/indicator-colors";
import { newWord } from "../src/core/model";
import { candidateSense } from "../src/ai/core";
import { renderStatusIcon, statusIcon } from "../src/components/status";

test("colour previews reuse real row SVGs without modifying the active palette", () => {
  const before = { ...indicatorColors() };
  const word = newWord(
    "plat",
    candidateSense({ pos: "n.m.", ipa: "pla", zh: "菜", en: "dish" }),
  );
  word.examples = [{ id: "e", french: "Un plat.", translation: "" }];
  for (const state of ["unmarked", "fuzzy", "known"] as const) {
    word.familiarity = state;
    assert.equal(
      renderStatusIcon(state, defaultIndicatorColors.examples),
      statusIcon(word),
    );
    const raw = Buffer.from(
      renderStatusIcon(state, "#123456")!.split(",")[1],
      "base64",
    ).toString();
    assert.ok(raw.includes('stroke="#123456"'));
    assert.equal(raw.includes("<path"), state !== "unmarked");
    assert.ok(raw.includes('cx="8" cy="8" r="7"'));
  }
  assert.deepEqual(indicatorColors(), before);
  assert.throws(() => renderStatusIcon("fuzzy", 'red" onload="x'));
});
test("chat and enrichment use one outline with a separate familiarity glyph", () => {
  for (const state of ["unmarked", "fuzzy", "known"] as const) {
    const svg = (color: string | undefined, multiple: boolean, chat: boolean) =>
      Buffer.from(
        renderStatusIcon(state, color, multiple, chat)!.split(",")[1],
        "base64",
      ).toString();
    assert.doesNotMatch(svg("#123456", false, false), /cx="13.8"/);
    assert.match(
      svg("#123456", false, true),
      /r="7".*cx="13.8" cy="2.2" r="1.85" fill="#86868b"/,
    );
    const diamond = svg("#123456", true, true);
    assert.match(diamond, /M7\.15 1\.15 Q8 \.3 8\.85 1\.15 L14\.85 7\.15/);
    assert.match(diamond, /mask="url\(#chat-gap\)"/);
    assert.equal((diamond.match(/<circle/g) ?? []).length, 2);
    assert.notEqual(
      renderStatusIcon(state, undefined, false, true, "#000000"),
      renderStatusIcon(state, undefined, false, true, "#86868b"),
    );
    const bubble = svg(undefined, false, true);
    assert.match(bubble, /L3.5 15/);
    assert.doesNotMatch(bubble, /<circle/);
    if (state === "known") assert.match(bubble, /#54bd76.*M4 8l3 3 6-7/);
    if (state === "fuzzy") assert.match(bubble, /#f5a623.*M5 5a3 3/);
    if (state === "unmarked")
      assert.equal((bubble.match(/<path/g) ?? []).length, 1);
  }
});

test("picker separates browsing, confirmation, defaults and explicit persistence", () => {
  const source = readFileSync(
    new URL("../src/components/indicator-colors.tsx", import.meta.url),
    "utf8",
  );
  const picker = source.slice(
    source.indexOf("function ColourPicker"),
    source.indexOf("function CustomColour"),
  );
  assert.ok(picker.includes("onSelectionChange="));
  assert.ok(picker.includes("setSelected(id)"));
  assert.ok(picker.includes('title="Use Colour"'));
  assert.ok(!picker.includes("saveIndicatorColors"));
  assert.ok(source.includes("setDraft({ ...defaultIndicatorColors })"));
  assert.equal((source.match(/await saveIndicatorColors\(/g) ?? []).length, 1);
  for (const label of [
    "Circle",
    " + Question Mark",
    " + Checkmark",
    "Custom HEX",
    "Save All Colours",
  ])
    assert.ok(source.includes(label));
  assert.ok(source.includes("renderStatusIcon(state, color, multiple)"));
});
