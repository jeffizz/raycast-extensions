import test from "node:test";
import assert from "node:assert/strict";
import {
  applyIndicatorColors,
  defaultIndicatorColors,
  parseIndicatorColors,
} from "../src/core/indicator-colors";
import { newWord } from "../src/core/model";
import { candidateSense } from "../src/ai/core";
import { statusIcon } from "../src/components/status";
test("palette validates complete six-digit HEX mappings and rejects SVG injection", () => {
  assert.deepEqual(
    parseIndicatorColors(defaultIndicatorColors),
    defaultIndicatorColors,
  );
  assert.equal(
    parseIndicatorColors({ ...defaultIndicatorColors, examples: " #AABBCC " })
      .examples,
    "#aabbcc",
  );
  for (const value of ["red", "#fff", '#123456" onload="x', null, 123]) {
    assert.throws(() =>
      parseIndicatorColors({ ...defaultIndicatorColors, examples: value }),
    );
  }
  assert.throws(() => parseIndicatorColors({}));
});
test("custom rings invalidate cached SVGs while the smaller question mark leaves circle geometry unchanged", () => {
  const word = newWord(
    "plat",
    candidateSense({ pos: "n.m.", ipa: "pla", zh: "菜", en: "dish" }),
  );
  word.familiarity = "fuzzy";
  word.examples = [{ id: "e", french: "Un plat", translation: "" }];
  const decode = () =>
    Buffer.from(statusIcon(word)!.split(",")[1], "base64").toString();
  try {
    const before = decode();
    assert.ok(before.includes("translate(8 8) scale(0.85) translate(-8 -8)"));
    const custom = { ...defaultIndicatorColors, examples: "#123456" };
    applyIndicatorColors(JSON.parse(JSON.stringify(custom)));
    const after = decode();
    assert.notEqual(after, before);
    assert.ok(after.includes('stroke="#123456"'));
    for (const image of [before, after])
      assert.ok(image.includes('cx="8" cy="8" r="7"'));
    for (let i = 0; i < 80; i++) {
      applyIndicatorColors({
        ...custom,
        examples: "#" + i.toString(16).padStart(6, "0"),
      });
      assert.ok(decode().includes("<circle"));
    }
  } finally {
    applyIndicatorColors(defaultIndicatorColors);
  }
});
