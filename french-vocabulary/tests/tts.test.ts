import test from "node:test";
import { frdicSpeechText, elevenSpeechText } from "../src/tts/segments";
import { speechRequest } from "../src/core/frdic";
import { emptyLibrary } from "../src/core/model";
import { applyImport } from "../src/core/importer";
import { questions, practiceSpeechTexts } from "../src/core/learning";
test("combined noun pronunciation is one Frdic payload with a sentence/tab boundary", () => {
  const text = frdicSpeechText(["ami", "un ami"]);
  assert.equal(text, "ami.\tun ami");
  const encoded = speechRequest(text).url.searchParams.get("txt")!;
  assert.equal(Buffer.from(encoded.slice(3), "base64").toString(), text);
  assert.equal(frdicSpeechText(["  ", "bonjour"]), "bonjour");
  assert.equal(frdicSpeechText([]), "");
});
test("ElevenLabs combined speech uses model-compatible pauses and keeps article liaison", () => {
  for (const model of ["eleven_v3", "eleven_v4", "eleven_v4_turbo"]) {
    const text = elevenSpeechText(["ami", "un ami"], model);
    assert.equal(text, "ami. [short pause] un ami.");
    assert.ok(!text.includes("<break"));
  }
  for (const model of [
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_turbo_v2_5",
  ]) {
    assert.equal(
      elevenSpeechText(["ami", "un ami"], model),
      'ami. <break time="0.8s" /> un ami.',
    );
  }
  assert.equal(elevenSpeechText(["ami"], "eleven_v4"), "ami");
  assert.equal(
    elevenSpeechText(["ami", "un ami"], "future_model"),
    "ami.\n\nun ami.",
  );
  assert.ok(
    elevenSpeechText(["<x>", "y"], "eleven_multilingual_v2").includes(
      "&lt;x&gt;",
    ),
  );
});
test("gender practice still excludes article hints before checking", () => {
  const lib = emptyLibrary();
  applyImport(
    lib,
    [["ami", "n.m.", "", "friend", ""]],
    ["word", "pos", "ipa", "en", "zh"],
  );
  const q = questions(lib, "gender", true)[0];
  assert.equal(frdicSpeechText(practiceSpeechTexts(q, false)), "ami");
  assert.equal(frdicSpeechText(practiceSpeechTexts(q, true)), "ami.\tun ami");
});

import assert from "node:assert/strict";
import { chooseProvider, parseFrdicPercentage } from "../src/tts/provider";
import { readMp3Response } from "../src/tts/audio-cache";
import { classify, describeElevenFailure } from "../src/tts/elevenlabs-errors";
import {
  reserveKey,
  failKey,
  reactivateKey,
  KeyState,
} from "../src/tts/key-state";
test("provider ratio validates boundaries and draws before provider work", () => {
  assert.equal(parseFrdicPercentage(), 100);
  for (const raw of ["-1", "101", "NaN", "Infinity"])
    assert.throws(() => parseFrdicPercentage(raw));
  assert.equal(
    chooseProvider(0, () => 0),
    "elevenlabs",
  );
  assert.equal(
    chooseProvider(100, () => 0.9999),
    "frdic",
  );
  assert.equal(
    chooseProvider(30, () => 0.299),
    "frdic",
  );
  assert.equal(
    chooseProvider(30, () => 0.3),
    "elevenlabs",
  );
});
test("ElevenLabs accepts bounded MP3 and rejects non-audio", async () => {
  const bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(120)]);
  assert.deepEqual(
    await readMp3Response(
      new Response(bytes, { headers: { "content-type": "audio/mpeg" } }),
    ),
    bytes,
  );
  await assert.rejects(
    readMp3Response(
      new Response("<html>error</html>", {
        headers: { "content-type": "text/html" },
      }),
    ),
  );
  await assert.rejects(
    readMp3Response(
      new Response("bad", { headers: { "content-type": "audio/mpeg" } }),
    ),
  );
});
test("key invalidation is limited to auth and credits and diagnostics redact secrets", async () => {
  assert.equal(classify(401, []), true);
  assert.equal(classify(402, []), false);
  assert.equal(classify(429, []), false);
  assert.equal(classify(403, ["quota_exceeded"]), true);
  const secret = "sk_very_secret_api_key";
  const failure = await describeElevenFailure(
    new Response(
      JSON.stringify({ detail: { status: "quota_exceeded", message: secret } }),
      { status: 403 },
    ),
    [secret],
  );
  assert.equal(failure.invalidatesKey, true);
  assert.ok(!failure.description.includes(secret));
});
test("key reservation excludes attempted and invalid keys and preserves counters", () => {
  const key = {
    id: "one",
    label: "test",
    secret: "unused",
    enabled: true,
    weight: 1,
    createdAt: 0,
    requests: 0,
    submittedCharacters: 0,
    successfulCharacters: 0,
    failures: 0,
    cycleCharacters: 0,
    cycleFailures: 0,
  };
  const state: KeyState = { keys: [key] };
  assert.equal(reserveKey(state, [], 7)?.id, "one");
  assert.equal(key.submittedCharacters, 7);
  assert.equal(reserveKey(state, ["one"], 7), undefined);
  failKey(key, "HTTP 401", true);
  assert.equal(reserveKey(state, [], 7), undefined);
  reactivateKey(key);
  assert.equal(reserveKey(state, [], 3)?.id, "one");
});
