import { environment } from "@raycast/api";
import { spawn, ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { mnemonicPhrases, speechWord, Word } from "./core/model";
import { fetchSpeech } from "./core/frdic";
import {
  speechSegments,
  frdicSpeechText,
  elevenSpeechText,
} from "./tts/segments";
import {
  getPreferences,
  chooseProvider,
  parseFrdicPercentage,
} from "./tts/preferences";
import {
  getElevenConfig,
  elevenRequestBody,
  requestElevenAudio,
} from "./tts/elevenlabs";
let playback: ChildProcess | undefined,
  generation = 0;
let download: AbortController | undefined;
let prepared:
  | { key: string; controller: AbortController; file: Promise<string> }
  | undefined;
export function prepareSpeech(texts: string[]) {
  stopSpeech();
  const parts = speechSegments(texts);
  if (!parts.length) return;
  const controller = new AbortController();
  download = controller;
  const file = audio(parts, controller.signal);
  prepared = { key: JSON.stringify(parts), controller, file };
  // Prefetch failures are reported only if playback is requested.
  void file.catch(() => {});
}
export function stopSpeech() {
  generation++;
  prepared = undefined;
  download?.abort();
  download = undefined;
  playback?.kill();
  playback = undefined;
}
async function audio(texts: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  const prefs = getPreferences();
  const provider = chooseProvider(
    parseFrdicPercentage(prefs.randomFrdicPercentage),
  );
  const config =
    provider === "elevenlabs" ? getElevenConfig("fr", prefs) : undefined;
  const text = config
    ? elevenSpeechText(texts, config.model)
    : frdicSpeechText(texts);
  const identity = config
    ? JSON.stringify({
        provider,
        voice: config.voiceId,
        body: elevenRequestBody(text, config),
        format: "mp3_44100_128",
      })
    : `anonymous-v4:${text}`;
  const key = createHash("sha256").update(identity).digest("hex");
  const dir = join(environment.supportPath, "speech-cache"),
    file = join(dir, `${key}.mp3`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (
    await stat(file)
      .then((s) => s.size > 0)
      .catch(() => false)
  )
    return file;
  const data = config
    ? await requestElevenAudio(text, config, signal)
    : await fetchSpeech(text, fetch, signal);
  signal.throwIfAborted();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, file);
  return file;
}
export async function speakTexts(texts: string[]) {
  const parts = speechSegments(texts);
  const reuse = prepared?.key === JSON.stringify(parts) ? prepared : undefined;
  if (reuse) {
    generation++;
    playback?.kill();
    playback = undefined;
    prepared = undefined;
  } else stopSpeech();
  const token = generation;
  if (!parts.length) return;
  const controller = reuse?.controller ?? new AbortController();
  download = controller;
  let file: string;
  try {
    file = await (reuse?.file ?? audio(parts, controller.signal));
  } catch (error) {
    if (controller.signal.aborted) return;
    throw error;
  } finally {
    if (download === controller) download = undefined;
  }
  if (token !== generation) return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/afplay", [file], { stdio: "ignore" });
    playback = child;
    child.on("error", reject);
    child.on("close", (code) => {
      if (playback === child) playback = undefined;
      token !== generation || code === 0
        ? resolve()
        : reject(Error("Audio playback failed."));
    });
  });
}
export async function speakWord(w: Word) {
  const word = speechWord(w);
  if (!word)
    throw Error("No pronounceable word remains after removing annotations.");
  await speakTexts([word, ...mnemonicPhrases(w)]);
}
