import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { environment } from "@raycast/api";
import { cachedSpeech } from "./speech-cache";
import { join } from "path";
import os from "os";

const execFileAsync = promisify(execFile);
const FRDIC_PREFIX = "QYN";
const API = "https://api.frdic.com/api/v2/speech/speakweb";

export async function playLocalAudio(localPath: string): Promise<void> {
  if (!existsSync(localPath)) {
    throw new Error(`本地音频缺失: ${localPath}`);
  }
  await execFileAsync("/usr/bin/afplay", [localPath]);
}

/** Match the frdic conjugation example: a question mark and a literal tab separate items. */
export function formatFrenchSpeechItems(items: string[]): string {
  const phrases = items.map((item) => item.trim()).filter(Boolean);
  if (phrases.some((item) => /[\t\r\n]/.test(item))) throw new Error("发音短语不能包含制表符或换行");
  return phrases.join("?\t");
}

export async function playFrenchSpeechItems(items: string[]): Promise<void> {
  const text = formatFrenchSpeechItems(items);
  if (!text) throw new Error("没有可朗读的内容");
  await playFrenchSpeech(text);
}

export async function playFrenchSpeech(text: string): Promise<void> {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  const params = new URLSearchParams({
    langid: "fr",
    txt: FRDIC_PREFIX + b64,
  });

  const url = `${API}?${params.toString()}`;
  const cacheDir = join(environment.supportPath, "speech-cache");
  const legacyKey = `fr_default_${b64}`.replace(/\+/g, "-").replace(/\//g, "_");
  const legacyFile = legacyKey.length < 240 ? join(os.tmpdir(), "frdic-cache", `${legacyKey}.mp3`) : undefined;
  const cacheFile = await cachedSpeech(cacheDir, text, async () => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "fr, zh-CN;q=0.9, zh;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.frdic.com/",
        "Sec-Fetch-Dest": "audio",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`frdic API ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }, legacyFile);

  await execFileAsync("/usr/bin/afplay", [cacheFile]);
}
