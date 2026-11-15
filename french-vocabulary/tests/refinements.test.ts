import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanWord, emptyLibrary, mnemonicPhrases } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import {
  comparison,
  groupName,
  sortWords,
  spellingDiff,
} from "../src/core/presentation";
import { questions, similarWords } from "../src/core/learning";
import { Store, readSQLiteBackup } from "../src/core/sqlite";
import { fetchSpeech, speechRequest } from "../src/core/frdic";

test("annotation cleanup and mnemonic speech", () => {
  for (const [a, b] of [
    ["reposer(se)", "reposer"],
    ["curieux,se", "curieux"],
    ["sculpteur(trice)", "sculpteur"],
    ["ancien(ne)", "ancien"],
    ["mot（note）", "mot"],
  ])
    assert.equal(cleanWord(a), b);
  const l = emptyLibrary();
  applyImport(
    l,
    [
      ["étudiante", "n.f."],
      ["reposer(se)", "v."],
    ],
    ["word", "pos"],
  );
  assert.deepEqual(mnemonicPhrases(l.words[0]), ["une étudiante"]);
  l.words.forEach((w) => (w.practice = true));
  assert.ok(questions(l, "copy").some((q) => q.expected === "reposer"));
});
test("browse modes preserve import sequence and use view activity", () => {
  const l = emptyLibrary();
  applyImport(l, [["zèbre"], ["ami"], ["mot"]], ["word"]);
  l.words.forEach((w) => (w.updatedAt = "2020-01-01T00:00:00Z"));
  l.words[0].lastViewedAt = "2026-01-01T00:00:00Z";
  const r = new Map(l.words.map((w, i) => [w.id, [0.9, 0.1, 0.5][i]]));
  const sorted = (mode: string) =>
    sortWords(l.words, l, mode, r).map((w) => w.word);
  assert.deepEqual(sorted("activity"), ["zèbre", "mot", "ami"]);
  assert.deepEqual(sorted("import"), ["zèbre", "ami", "mot"]);
  assert.deepEqual(sorted("import-desc"), ["mot", "ami", "zèbre"]);
  assert.deepEqual(sorted("alphabetical"), ["ami", "mot", "zèbre"]);
  assert.deepEqual(sorted("random"), ["ami", "mot", "zèbre"]);
});
test("similarity cutoff and compact comparison", () => {
  const l = emptyLibrary();
  applyImport(
    l,
    [
      ["demain", "adv.", "", "tomorrow", "明天"],
      ["xyz", "n.", "", "x", "甲"],
      ["main", "n.f.", "", "hand", "手"],
    ],
    ["word", "pos", "ipa", "en", "zh"],
  );
  assert.ok(similarWords(l, l.words[0]).every((x) => x.score >= 0.5));
  assert.ok(!similarWords(l, l.words[0]).some((x) => x.word.word === "xyz"));
  const text = comparison(l.words);
  assert.ok(text.includes("| **demain** | adv. | 明天 | tomorrow |"));
  assert.ok(!text.includes("| EN |"));
  assert.equal(groupName(l.words), "demain · xyz · main");
  assert.ok(
    spellingDiff("etudiante", "étudiante").includes(
      "| étudiante |\n| etudiante |",
    ),
  );
  assert.ok(
    spellingDiff("main", "matin").indexOf("matin") <
      spellingDiff("main", "matin").indexOf("| main |"),
  );
});
test("SQLite file export retains views and library, excludes local status", async () => {
  const root = await mkdtemp(join(tmpdir(), "fv-refine-"));
  try {
    const s = new Store(join(root, "local"));
    await s.mutate((l) => {
      applyImport(l, [["main"]], ["word"]);
    });
    const before = await s.load();
    await s.touchWord(before.words[0].id);
    const touched = await s.load();
    assert.ok(touched.words[0].lastViewedAt);
    assert.equal(touched.words[0].updatedAt, before.words[0].updatedAt);
    assert.equal(touched.revision, before.revision + 1);
    await s.setMeta("webdav", { error: "local only" });
    const path = await s.exportSQLite(join(root, "export.sqlite"));
    const data = await readFile(path);
    const restored = await readSQLiteBackup(data);
    assert.equal(restored.words[0].word, "main");
    assert.equal(restored.words[0].lastViewedAt, touched.words[0].lastViewedAt);
    assert.ok(!data.includes(Buffer.from("local only")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("speech requests use only the anonymous endpoint without credentials", () => {
  const r = speechRequest("étudiante");
  assert.equal(r.url.pathname, "/api/v2/speech/speakweb");
  assert.equal(
    r.url.searchParams.get("txt"),
    `QYN${Buffer.from("étudiante").toString("base64")}`,
  );
  assert.equal(r.headers.authorization, undefined);
  assert.equal(r.headers.eudicuseragent, undefined);
  assert.equal(r.url.searchParams.has("voicename"), false);
});
test("speech redirect downloads audio and never forwards credentials cross-origin", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fake = (async (input: URL | string, init: RequestInit) => {
    calls.push({
      url: String(input),
      headers: init.headers as Record<string, string>,
    });
    return calls.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: "https://audio.example.test/sound" },
        })
      : new Response(Buffer.from("ID3-audio"), {
          headers: { "content-type": "text/plain" },
        });
  }) as typeof fetch;
  const b = await fetchSpeech("mot", fake);
  assert.equal(b.toString(), "ID3-audio");
  assert.equal(calls[0].headers.authorization, undefined);
  assert.ok(calls[0].headers.referer);
  assert.equal(calls[1].headers.referer, undefined);
  assert.equal(calls[1].headers.authorization, undefined);
  assert.equal(calls[1].headers.eudicuseragent, undefined);
});
test("speech diagnostics do not include authorization or response body", async () => {
  await assert.rejects(
    fetchSpeech(
      "mot",
      (async () =>
        new Response("private body", { status: 401 })) as typeof fetch,
    ),
    (e) =>
      String(e).includes("401") &&
      !String(e).includes("secret") &&
      !String(e).includes("private body"),
  );
});
