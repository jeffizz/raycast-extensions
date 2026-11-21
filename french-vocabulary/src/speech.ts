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
export function stopSpeech() {
  generation++;
  playback?.kill();
  playback = undefined;
}
async function audio(texts: string[]) {
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
    ? await requestElevenAudio(text, config)
    : await fetchSpeech(text);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, file);
  return file;
}
export async function speakTexts(texts: string[]) {
  stopSpeech();
  const token = generation;
  const parts = speechSegments(texts);
  if (!parts.length) return;
  const file = await audio(parts);
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
