import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, Mode } from "../src/core/model";
import {
  applyImport,
  ImportDecision,
  combineImportText,
} from "../src/core/importer";
import {
  comparison,
  importConflictMarkdown,
  detailMarkdown,
  sessionTranslationLanguage,
  recentMistakes,
  spellingDiff,
  spellingMarkdown,
  translations,
  LanguageMode,
} from "../src/core/presentation";
import {
  questions,
  recordAnswer,
  copyQuestionsInOrder,
} from "../src/core/learning";
test("Copy Spelling stably places Know words last in either supplied order", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["a"], ["b"], ["c"], ["d"]], ["word"]);
  lib.words[0].familiarity = "known";
  lib.words[2].familiarity = "known";
  assert.deepEqual(
    copyQuestionsInOrder(lib, lib.words).map((q) => q.word.word),
    ["b", "d", "a", "c"],
  );
  assert.deepEqual(
    copyQuestionsInOrder(lib, [...lib.words].reverse()).map((q) => q.word.word),
    ["d", "b", "c", "a"],
  );
});
test("Browse copy spelling preserves the supplied order and filters ineligible words", () => {
  const lib = emptyLibrary();
  applyImport(lib, [["zèbre"], ["ami"], ["monde"]], ["word"]);
  lib.words[1].practice = false;
  lib.settings = {
    practice: { copy: { scope: "selected", wordIds: [], autoSpeak: false } },
  };
  const original = JSON.stringify(lib);
  const queue = copyQuestionsInOrder(lib, [
    lib.words[2],
    lib.words[1],
    lib.words[0],
  ]);
  assert.deepEqual(
    queue.map((q) => q.word.word),
    ["monde", "zèbre"],
  );
  assert.ok(queue.every((q) => q.mode === "copy"));
  assert.equal(JSON.stringify(lib), original);
  lib.words[2].archived = true;
  assert.deepEqual(copyQuestionsInOrder(lib, [lib.words[2]]), []);
});
import { modeSettings, toggleAutoSpeak } from "../src/core/practice-settings";
test("pronunciation toggles persist independently and normalize retired mode selections", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-audio-toggle-"));
  try {
    const store = new Store(root);
    await store.mutate((lib) => {
      lib.settings ??= {};
      lib.settings.practice = {
        copy: { autoSpeak: false, scope: "selected", wordIds: ["chosen"] },
      };
      assert.equal(toggleAutoSpeak(lib, "copy"), true);
      assert.equal(toggleAutoSpeak(lib, "gender"), true);
      assert.equal(toggleAutoSpeak(lib, "gender"), false);
    });
    const restored = await new Store(root).load();
    assert.equal(modeSettings(restored, "copy").autoSpeak, true);
    assert.deepEqual(modeSettings(restored, "copy").wordIds, []);
    assert.equal(modeSettings(restored, "copy").scope, "default");
    assert.equal(modeSettings(restored, "gender").autoSpeak, false);
    assert.equal(modeSettings(restored, "meaning").autoSpeak, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
import { statusIcon } from "../src/components/status";
import { Store } from "../src/core/sqlite";
import { fetchSpeech } from "../src/core/frdic";

test("ambiguous import decisions preserve IDs, metadata and explicit sense separation", () => {
  const mapping = ["word", "pos", "en", "zh"] as const;
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["sympa", "adj.inv.", "nice / friendly", "〈俗〉给人好感的，讨人喜欢的"]],
    [...mapping],
  );
  const original = structuredClone(lib);
  const row = [
    ["sympa", "adj.inv.", "nice / friendly", "给人好感的,讨人喜欢的"],
  ];
  let key = "";
  applyImport(lib, row, [...mapping], "review", (c) => {
    assert.equal(c.candidates.length, 1);
    key = c.key;
    return { action: "keep" };
  });
  assert.deepEqual(lib, original);
  applyImport(lib, row, [...mapping], "review", (c) => {
    assert.equal(c.key, key);
    return { action: "update", target: 0 };
  });
  assert.equal(lib.words[0].senses.length, 1);
  assert.equal(lib.words[0].senses[0].id, original.words[0].senses[0].id);
  assert.equal(
    lib.words[0].senses[0].genderSource,
    original.words[0].senses[0].genderSource,
  );
  const separate = structuredClone(original);
  applyImport(separate, row, [...mapping], "review", () => ({ action: "add" }));
  assert.equal(separate.words[0].senses.length, 2);
  let called = false;
  applyImport(lib, row, [...mapping], "review", () => {
    called = true;
    return { action: "keep" };
  });
  assert.equal(called, false);
  const different = structuredClone(original);
  applyImport(
    different,
    [["sympa", "adj.inv.", "another meaning", "different"]],
    [...mapping],
    "review",
    () => {
      throw Error("Not ambiguous");
    },
  );
  assert.equal(different.words[0].senses.length, 2);
  const staged = emptyLibrary();
  let conflicts = 0;
  applyImport(
    staged,
    [
      ["sympa", "adj.inv.", "nice / friendly", "〈俗〉给人好感的，讨人喜欢的"],
      ...row,
    ],
    [...mapping],
    "review",
    () => {
      conflicts++;
      return { action: "keep" };
    },
  );
  assert.equal(conflicts, 1);
  assert.equal(staged.words[0].senses.length, 1);
});

test("import conflict tables align existing and incoming fields and escape multiline data", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["lecture", "n.f.", "", "reading", "original"]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  const existing = lib.words[0].senses[0];
  const incoming = { ...existing, ipa: "/new/", zh: "line1\nline2", en: "a|b" };
  const markdown = importConflictMarkdown("lecture", incoming, [
    existing,
    existing,
  ]);
  assert.ok(markdown.includes("| Existing | Incoming |"));
  assert.ok(markdown.includes("| — | /new/ |"));
  assert.ok(markdown.includes("| original | line1<br>line2 |"));
  assert.ok(markdown.includes("a\\|b"));
  assert.ok(markdown.includes("## Existing Sense 2"));
});

test("field merges preserve sense identity and review references, and decisions survive restart", async () => {
  const mapping = ["word", "pos", "ipa", "en", "zh"] as const;
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["lecture", "n.f.", "/old/", "reading", "old translation"]],
    [...mapping],
  );
  const before = structuredClone(lib.words[0].senses[0]);
  const rows = [["lecture", "n.f.", "/new/", "reading", "new translation"]];
  const decisions: Record<string, ImportDecision> = {};
  applyImport(structuredClone(lib), rows, [...mapping], "preview", (c) => {
    decisions[c.key] = {
      action: "merge",
      target: 0,
      fields: { ipa: "existing", zh: "incoming", en: "existing" },
    };
    return { action: "keep" };
  });
  const root = await mkdtemp(join(tmpdir(), "fv-import-draft-"));
  try {
    const draft = { libraryId: lib.libraryId, rows, mapping, decisions };
    await new Store(root).setMeta("import-review-draft", draft);
    const restored = await new Store(root).getMeta<typeof draft>(
      "import-review-draft",
    );
    assert.deepEqual(restored, draft);
    applyImport(lib, rows, [...mapping], "commit", (c) => {
      assert.equal(c.key.length, 64);
      assert.ok(restored!.decisions[c.key]);
      return restored!.decisions[c.key];
    });
    const merged = lib.words[0].senses[0];
    assert.equal(merged.id, before.id);
    assert.equal(merged.ipa, before.ipa);
    assert.equal(merged.zh, "new translation");
    assert.equal(merged.genderSource, before.genderSource);
    assert.equal(lib.words[0].senses.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("2500-row conflict review has compact reproducible keys across repeated decisions", () => {
  const mapping = ["word", "pos", "ipa", "en", "zh"] as const;
  const rows = Array.from({ length: 2500 }, (_, i) => [
    "word" + i,
    "n.f.",
    "/old/",
    "meaning" + i,
    "old",
  ]);
  const lib = emptyLibrary();
  applyImport(lib, rows, [...mapping]);
  const incoming = rows.map((r) => [...r.slice(0, 4), "new"]);
  const decisions: Record<string, ImportDecision> = {};
  for (let pass = 0; pass < 4; pass++) {
    let count = 0;
    applyImport(
      structuredClone(lib),
      incoming,
      [...mapping],
      "preview",
      (c) => {
        count++;
        assert.equal(c.key.length, 64);
        if (pass === 0) decisions[c.key] = { action: "keep" };
        else assert.ok(decisions[c.key]);
        return decisions[c.key];
      },
    );
    assert.equal(count, 2500);
  }
  assert.equal(lib.words[0].senses[0].zh, "old");
});

test("translation merge concatenates in the selected order without empty or identical duplicates", () => {
  assert.equal(combineImportText("old", "new"), "old; new");
  assert.equal(combineImportText("same", "same"), "same");
  assert.equal(combineImportText("é", "e\u0301"), "é");
  assert.equal(combineImportText("", "new"), "new");
  assert.equal(combineImportText("old", ""), "old");
  const mapping = ["word", "pos", "ipa", "en", "zh"] as const;
  for (const order of ["existing-first", "incoming-first"] as const) {
    const lib = emptyLibrary();
    applyImport(
      lib,
      [["lecture", "n.f.", "/old/", "reading", "old"]],
      [...mapping],
    );
    const id = lib.words[0].senses[0].id;
    applyImport(
      lib,
      [["lecture", "n.f.", "/new/", "reading", "new"]],
      [...mapping],
      "merge",
      () => ({
        action: "merge",
        target: 0,
        fields: { zh: order, en: order, ipa: "existing" },
      }),
    );
    assert.equal(
      lib.words[0].senses[0].zh,
      order === "existing-first" ? "old; new" : "new; old",
    );
    assert.equal(lib.words[0].senses[0].en, "reading");
    assert.equal(lib.words[0].senses[0].ipa, "/old/");
    assert.equal(lib.words[0].senses[0].id, id);
    assert.equal(lib.words[0].senses.length, 1);
  }
});

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

test("literal translation brackets cannot become Raycast LaTeX delimiters", () => {
  const lib = sample();
  lib.words[0].senses[0].zh = String.raw`[relationship] \\[manner\\] $$value$$ \\(text\\)`;
  const rendered = detailMarkdown(lib.words[0]);
  assert.ok(rendered.includes("&#91;relationship&#93;"));
  assert.ok(!rendered.includes("\\\\["));
  assert.ok(!rendered.includes("$$"));
  assert.equal(lib.words[0].senses[0].zh.startsWith("[relationship]"), true);
});
test("session English toggle permits Chinese Only overrides but leaves English Only unchanged", () => {
  const word = sample().words[0];
  const before = JSON.stringify(word);
  for (const base of [
    "zh-first",
    "en-first",
    "zh-only",
    "en-only",
  ] as LanguageMode[]) {
    assert.equal(sessionTranslationLanguage(base, base !== "zh-only"), base);
    for (const shown of [false, true]) {
      const mode = sessionTranslationLanguage(base, shown);
      const text = detailMarkdown(word, false, mode);
      assert.equal(text.includes("to go"), base === "en-only" || shown);
      assert.equal(text.includes("去，走"), base !== "en-only");
      if (base === "en-first" && shown) assert.equal(mode, "en-first");
    }
  }
  assert.equal(sessionTranslationLanguage(undefined, true), "zh-first");
  assert.equal(JSON.stringify(word), before);
});
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
