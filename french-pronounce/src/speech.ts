import { getPreferences, type VoiceName } from "./preferences";
import { execFile } from "child_process";
import { promisify } from "util";
import { rm } from "fs/promises";
import { cachedAudio, readMp3Response } from "./audio-cache";
import { getElevenConfig, requestElevenAudio } from "./elevenlabs";
import { getStrategy } from "./strategy";
import { validateText } from "./text-safety";

const execFileAsync = promisify(execFile);
export type Language = "fr" | "en";
export type { VoiceName };

async function frdicAudio(text: string, language: Language, voiceName?: VoiceName): Promise<string> {
  const voice = language === "en" ? voiceName ?? getPreferences().voicename ?? "en_uk_female" : "default";
  return cachedAudio({ provider: "frdic", text, language, voice }, async () => {
    const params = new URLSearchParams({ langid: language, txt: `QYN${Buffer.from(text, "utf-8").toString("base64")}` });
    if (language === "en") params.set("voicename", voice);
    const response = await fetch(`https://api.frdic.com/api/v2/speech/speakweb?${params}`, {
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "audio/mpeg",
        "Accept-Encoding": "identity",
        Referer: "https://www.frdic.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`frdic HTTP ${response.status}`);
    }
    return readMp3Response(response);
  });
}

async function elevenAudio(text: string, language: Language): Promise<string> {
  const config = getElevenConfig(language);
  return cachedAudio({ provider: "elevenlabs", text, config, format: "mp3_44100_128" }, () => requestElevenAudio(text, config));
}

async function playFile(path: string): Promise<void> {
  try {
    await execFileAsync("/usr/bin/afplay", [path]);
  } catch {
    await rm(path, { force: true });
    // Playback/device errors must never consume another provider's API quota.
    throw new Error("Audio playback failed; cache entry removed. Check audio output and try again");
  }
}

export async function playSpeech(text: string, language: Language, voiceName?: VoiceName): Promise<void> {
  const safeText = validateText(text, getPreferences().strictPrivacyChecks !== false);
  const strategy = await getStrategy();
  let file: string;
  if (strategy === "elevenlabs") {
    file = await elevenAudio(safeText, language);
  } else if (strategy === "frdic") {
    file = await frdicAudio(safeText, language, voiceName);
  } else {
    try {
      file = await frdicAudio(safeText, language, voiceName);
    } catch {
      file = await elevenAudio(safeText, language);
    }
  }
  await playFile(file);
}
