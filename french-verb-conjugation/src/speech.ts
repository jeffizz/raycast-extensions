import { showToast, Toast } from "@raycast/api";
import { execFile, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const FRDIC_PREFIX = "QYN";
const API = "https://api.frdic.com/api/v2/speech/speakweb";

let playing: ChildProcess | null = null;

export async function playSpeech(text: string, label: string) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `朗读${label}` });
  try {
    const file = await cachedMp3(text);
    playing?.kill("SIGTERM");
    playing = execFile("/usr/bin/afplay", [file], (error) => {
      if (error && !error.killed) {
        showToast({ style: Toast.Style.Failure, title: "无法播放", message: error.message });
      }
    });
    toast.hide();
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "朗读失败";
    toast.message = error instanceof Error ? error.message : "frdic 没有返回音频";
  }
}

async function cachedMp3(text: string) {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  const params = new URLSearchParams({ langid: "fr", txt: FRDIC_PREFIX + b64 });
  const cacheDir = join(tmpdir(), "frdic-cache");
  const cacheFile = join(cacheDir, `${b64.replace(/\+/g, "-").replace(/\//g, "_")}.mp3`);
  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(cacheFile)) {
    const res = await fetch(`${API}?${params.toString()}`, {
      headers: {
        Accept: "*/*",
        Referer: "https://www.frdic.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`frdic API ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("frdic API 没有返回音频");
    writeFileSync(cacheFile, buf);
  }
  return cacheFile;
}
