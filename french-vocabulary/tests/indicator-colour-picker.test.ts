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
    "Circle + Question Mark",
    "Circle + Checkmark",
    "Custom HEX",
    "Save All Colours",
  ])
    assert.ok(source.includes(label));
  assert.ok(source.includes("renderStatusIcon(state, color)"));
});
