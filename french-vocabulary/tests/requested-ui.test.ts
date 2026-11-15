import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, Mode } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  comparison,
  detailMarkdown,
  recentMistakes,
  spellingDiff,
  spellingMarkdown,
  translations,
  LanguageMode,
} from "../src/core/presentation";
import { questions, recordAnswer } from "../src/core/learning";
import { statusIcon } from "../src/components/status";
import { Store } from "../src/core/sqlite";
import { fetchSpeech } from "../src/core/frdic";

function sample() {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [
      ["aller", "v.i.", "", "to go", "去，走"],
      ["aller", "n.m.", "", "one-way ticket", "去程票"],
    ],
    ["word", "pos", "ipa", "en", "zh"],
  );
  return lib;
}

test("all four translation modes apply to details and comparison columns", () => {
  const w = sample().words[0];
  for (const [mode, expected] of [
    ["zh-first", ["去，走", "to go"]],
    ["en-first", ["to go", "去，走"]],
    ["zh-only", ["去，走"]],
    ["en-only", ["to go"]],
  ] as [LanguageMode, string[]][]) {
    const text = translations(w.senses[0], mode);
    assert.equal(text, expected.join("\n\n"));
    const details = detailMarkdown(w, false, mode);
    const table = comparison([w], mode);
    for (const value of expected) {
      assert.ok(details.includes(value));
      assert.ok(table.includes(value));
    }
    if (mode === "zh-only") {
      assert.ok(!details.includes("to go"));
      assert.ok(!table.includes("to go"));
    }
    if (mode === "en-only") {
      assert.ok(!details.includes("去，走"));
      assert.ok(!table.includes("去，走"));
    }
    const widths = table.split("\n").map((row) => row.split("|").length);
    assert.equal(new Set(widths).size, 1);
    assert.equal(widths[0], expected.length + 4);
  }
  assert.ok(comparison([w]).includes("去程票"));
  const compact = detailMarkdown(w);
  assert.ok(compact.includes("(v.i.)  \n去，走  \nto go\n\n---\n\n(n.m.)"));
  assert.ok(!compact.includes("EN:"));
  assert.ok(!compact.includes("CN:"));
});

test("copy and recall spelling put plain answer comparison between title and full details", () => {
  const w = sample().words[0];
  w.notes = "A usage note";
  for (const copy of [true, false]) {
    const text = spellingMarkdown(w, "aller", "aler", true, "zh-first", copy);
    assert.ok(text.indexOf("# aller") < text.indexOf("| aller |"));
    assert.ok(text.indexOf("| aller |") < text.indexOf("| aler |"));
    assert.ok(text.indexOf("| aler |") < text.indexOf("(v.i.)"));
    assert.ok(text.includes("A usage note"));
    assert.ok(text.includes("去程票"));
  }
  const hidden = spellingMarkdown(w, "aller", "", false);
  assert.ok(!hidden.includes("aller"));
  assert.ok(hidden.includes("去，走"));
  assert.ok(
    spellingMarkdown(w, "aller", "", false, "zh-first", true).includes(
      "A usage note",
    ),
  );
  assert.ok(spellingDiff("aler", "aller").includes("| aller |\n| aler |"));
});

test("status uses one icon with a practice ring, not a second status or fake known state", () => {
  const w = sample().words[0];
  const svg = () =>
    Buffer.from(statusIcon(w)!.split(",")[1], "base64").toString();
  w.practice = false;
  w.familiarity = "unmarked";
  assert.equal(statusIcon(w), undefined);
  w.practice = true;
  assert.ok(svg().includes("<circle"));
  assert.ok(!svg().includes("<path"));
  for (const state of ["fuzzy", "known", "unknown"] as const) {
    w.familiarity = state;
    w.practice = false;
    const plain = svg();
    assert.ok(plain.includes("<path"));
    assert.ok(!plain.includes("<circle"));
    w.practice = true;
    assert.ok(svg().includes("<circle"));
  }
});

test("recent mistakes use the last error as anchor, include the 7-day boundary, deduplicate and ignore copy/correct answers", () => {
  const lib = emptyLibrary();
  const add = (
    wordId: string,
    at: string,
    correct = false,
    mode: Mode = "spelling",
  ) =>
    lib.reviews.push({
      id: String(lib.reviews.length),
      wordId,
      mode,
      at,
      correct,
      rating: 1,
      answer: "",
      expected: "",
    });
  add("latest", "2020-01-10T12:00:00Z");
  add("boundary", "2020-01-03T12:00:00Z");
  add("old", "2020-01-03T11:59:59Z");
  add("latest", "2020-01-05T12:00:00Z");
  add("correct", "2030-01-01T00:00:00Z", true);
  add("copy", "2030-01-01T00:00:00Z", false, "copy");
  add("invalid", "invalid");
  assert.deepEqual(recentMistakes(lib), ["latest", "boundary"]);
  assert.deepEqual(recentMistakes(emptyLibrary()), []);
});

test("full reset clears vocabulary, groups, cards and reviews, with a recoverable safety copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-reset-"));
  try {
    const store = new Store(root);
    await store.mutate((lib) => {
      applyImport(
        lib,
        [["aller", "v.i.", "", "to go", "去"]],
        ["word", "pos", "ipa", "en", "zh"],
      );
      const w = lib.words[0];
      w.practice = true;
      w.notes = "A note";
      lib.groups.push({
        id: "group",
        name: "test",
        wordIds: [w.id],
        notes: "",
        updatedAt: new Date().toISOString(),
      });
      recordAnswer(lib, questions(lib, "spelling", true)[0], 1, "aler", false);
    });
    const before = await store.load();
    assert.equal(before.cards.length, 1);
    await store.resetLibrary();
    const after = await store.load();
    assert.deepEqual(
      [
        after.words.length,
        after.groups.length,
        after.cards.length,
        after.reviews.length,
      ],
      [0, 0, 0, 0],
    );
    assert.ok(after.revision > before.revision);
    const backups = await readdir(join(root, "backups"));
    const safety = JSON.parse(
      await readFile(
        join(
          root,
          "backups",
          backups.find((name) => name.includes("before-reset"))!,
        ),
        "utf8",
      ),
    );
    assert.equal(safety.words[0].notes, "A note");
    assert.equal(safety.reviews.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("anonymous speech rejects insecure redirects and non-audio responses", async () => {
  await assert.rejects(
    fetchSpeech(
      "mot",
      (async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://audio.example.test/file" },
        })) as typeof fetch,
    ),
    /unsafe/,
  );
  await assert.rejects(
    fetchSpeech("mot", (async () => new Response("not audio")) as typeof fetch),
    /no audio/,
  );
});
