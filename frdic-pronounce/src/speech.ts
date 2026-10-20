import { getPreferenceValues } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

const execFileAsync = promisify(execFile);
const FRDIC_PREFIX = "QYN";
const API = "https://api.frdic.com/api/v2/speech/speakweb";

export type Language = "fr" | "en";
export type VoiceName = "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female";

interface Preferences {
  voicename: VoiceName;
}

export async function playSpeech(text: string, language: Language, voiceName?: VoiceName): Promise<void> {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  const params = new URLSearchParams({
    langid: language,
    txt: FRDIC_PREFIX + b64,
  });

  if (language === "en") {
    const preferences = getPreferenceValues<Preferences>();
    params.set("voicename", voiceName ?? preferences.voicename ?? "en_uk_female");
  }

  const url = `${API}?${params.toString()}`;
  const cacheDir = join(os.tmpdir(), "frdic-cache");
  const cacheKey = `${language}_${params.get("voicename") ?? "default"}_${b64}`
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const cacheFile = join(cacheDir, `${cacheKey}.mp3`);

  mkdirSync(cacheDir, { recursive: true });

  if (!existsSync(cacheFile)) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!res.ok) throw new Error(`frdic API ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("frdic API returned no audio");
    writeFileSync(cacheFile, buf);
  }

  await execFileAsync("/usr/bin/afplay", [cacheFile]);
}
