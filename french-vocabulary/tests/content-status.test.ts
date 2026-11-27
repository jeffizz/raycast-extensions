import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newWord } from "../src/core/model";
import { candidateSense } from "../src/ai/core";
import {
  enrichmentStatus,
  statusIcon,
  statusTooltip,
} from "../src/components/status";

const read = (p: string) =>
  readFileSync(new URL("../src/" + p, import.meta.url), "utf8");
const sample = () =>
  newWord(
    "plat",
    candidateSense({ pos: "n.m.", ipa: "pla", zh: "菜", en: "dish" }),
  );
const svg = (word: ReturnType<typeof sample>) =>
  Buffer.from(statusIcon(word)!.split(",")[1], "base64").toString();

test("status indicators are the final accessory in every vocabulary surface", () => {
  for (const [path, marker] of [
    ["browse.tsx", "...contentAccessories(w),"],
    ["practice.tsx", "...contentAccessories(word),"],
  ]) {
    const source = read(path);
    const start = source.indexOf(marker);
    assert.ok(start >= 0);
    assert.match(source.slice(start + marker.length), /^\s*\]\}?/);
  }
  const group = read("components/group-details.tsx");
  const accessories = group.slice(
    group.indexOf("accessories={["),
    group.indexOf("actions={", group.indexOf("accessories={[")),
  );
  assert.ok(
    accessories.indexOf("word.archived") < accessories.indexOf("...(icon"),
  );
});
test("enrichment and familiarity occupy a single composite symbol", () => {
  const word = sample();
  assert.equal(statusIcon(word), undefined);
  word.examples = [{ id: "e", french: "Un plat.", translation: "一道菜。" }];
  assert.ok(svg(word).includes("<circle"));
  assert.ok(!svg(word).includes("<path"));
  const examplesColor = enrichmentStatus(word).color;
  for (const familiarity of ["fuzzy", "known", "unknown"] as const) {
    word.familiarity = familiarity;
    assert.ok(svg(word).includes("<circle"));
    assert.ok(svg(word).includes("<path"));
    const before = statusIcon(word);
    word.practice = !word.practice;
    assert.equal(statusIcon(word), before);
  }
  assert.ok(statusTooltip(word).includes("Exp(1)"));
  word.mnemonic = "A short cue.";
  assert.notEqual(enrichmentStatus(word).color, examplesColor);
  assert.equal(enrichmentStatus(word).color, "#e879bd");
  assert.ok(statusTooltip(word).includes("Mnemonic"));
});
test("compact tooltips omit mnemonic only above three enrichment types", () => {
  const word = sample();
  word.familiarity = "known";
  word.examples = [{ id: "e", french: "x", translation: "" }];
  word.mnemonic = "cue";
  word.collocations = "legacy";
  assert.equal(statusTooltip(word), "Know\nExp(1)\nColl(+)\nMnemonic");
  word.familyLinks = [
    {
      senseId: word.senses[0].id,
      targetWordId: "other",
      description: "related",
      source: { kind: "ai", at: "now" },
    },
  ];
  assert.equal(statusTooltip(word), "Know\nExp(1)\nFamily(1)\nColl(+)");
  const dashboard = read("dashboard.tsx");
  assert.ok(
    dashboard.indexOf('title="Personalization"') >
      dashboard.indexOf('title="Pronunciation"'),
  );
  const preview = read("components/indicator-colors.tsx");
  assert.ok(preview.includes('text=""'));
  assert.ok(!preview.includes("text={label}"));
});
test("each enrichment category has a distinct colour and multiple types share one colour", () => {
  const word = sample();
  const colours = new Set<string>();
  for (const kind of ["examples", "family", "collocations", "mnemonic"]) {
    word.examples = [];
    delete word.familyLinks;
    delete word.collocations;
    delete word.mnemonic;
    if (kind === "examples")
      word.examples = [{ id: "e", french: "x", translation: "" }];
    if (kind === "family")
      word.familyLinks = [
        {
          senseId: word.senses[0].id,
          targetWordId: "other",
          description: "related",
          source: { kind: "ai", at: new Date().toISOString() },
        },
      ];
    if (kind === "collocations") word.collocations = "Legacy text";
    if (kind === "mnemonic") word.mnemonic = "Cue";
    colours.add(enrichmentStatus(word).color!);
    assert.ok(svg(word).includes("<circle"));
  }
  assert.equal(colours.size, 4);
});
test("family cache capacity and shared rendering remain wired correctly", () => {
  const family = read("ai/family-view.tsx"),
    client = read("ai/client.ts");
  assert.ok(family.includes("if (active) void run()"));
  assert.ok(!family.includes("setResult(undefined)"));
  assert.ok(client.includes('task === "family" || independent ? 30 : 7'));
  assert.ok(client.includes('"ai-family-cache"'));
  assert.ok(client.includes('"ai-usage-cache"'));
  assert.ok(client.includes("retentionDays === 30 ? 300 : 30"));
  for (const path of ["browse.tsx", "practice.tsx"]) {
    const source = read(path);
    assert.ok(source.includes("...contentAccessories("));
    assert.ok(!source.includes("const familiarityIcon ="));
    assert.ok(!source.includes('title="Practice Inclusion"'));
  }
  assert.ok(!read("components/word.tsx").includes("practiceShortcut"));
  const accessory = read("components/content-status.ts");
  assert.ok(accessory.includes("statusIcon(word)"));
  assert.ok(accessory.includes("statusTooltip(word)"));
});
