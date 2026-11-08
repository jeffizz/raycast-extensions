import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

const execFileAsync = promisify(execFile);
const FRDIC_PREFIX = "QYN";
const API = "https://api.frdic.com/api/v2/speech/speakweb";

export async function playLocalOrRemoteAudio(localPath: string, remoteUrl?: string): Promise<void> {
  if (existsSync(localPath)) {
    await execFileAsync("/usr/bin/afplay", [localPath]);
    return;
  }

  if (remoteUrl) {
    const fileName = remoteUrl.split("/").pop() || "audio.mp3";
    const cacheDir = join(os.tmpdir(), "frdic-cache");
    const cacheFile = join(cacheDir, fileName);

    mkdirSync(cacheDir, { recursive: true });

    if (!existsSync(cacheFile)) {
      const res = await fetch(remoteUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(cacheFile, buf);
    }

    await execFileAsync("/usr/bin/afplay", [cacheFile]);
  }
}

export async function playFrenchSpeech(text: string): Promise<void> {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  const params = new URLSearchParams({
    langid: "fr",
    txt: FRDIC_PREFIX + b64,
  });

  const url = `${API}?${params.toString()}`;
  const cacheDir = join(os.tmpdir(), "frdic-cache");
  const cacheKey = `fr_default_${b64}`.replace(/\+/g, "-").replace(/\//g, "_");
  const cacheFile = join(cacheDir, `${cacheKey}.mp3`);

  mkdirSync(cacheDir, { recursive: true });

  if (!existsSync(cacheFile)) {
    const res = await fetch(url, {
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
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("frdic API returned no audio");
    writeFileSync(cacheFile, buf);
  }

  await execFileAsync("/usr/bin/afplay", [cacheFile]);
}
