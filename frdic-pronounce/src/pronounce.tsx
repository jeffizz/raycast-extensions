import { getSelectedText as getRaycastSelectedText, showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

const execFileAsync = promisify(execFile);

const FRDIC_PREFIX = "QYN"; // frdic speakweb API fixed prefix
const API = "https://api.frdic.com/api/v2/speech/speakweb";

/** Remove only leading and trailing whitespace; preserve the selected text itself. */
function trimSelectedText(raw: string): string | null {
  const text = raw.trim();
  return text || null;
}

/** Play audio with afplay, with a simple disk cache */
async function playAudio(word: string): Promise<void> {
  const b64 = Buffer.from(word, "utf-8").toString("base64");
  const url = `${API}?langid=fr&txt=${encodeURIComponent(FRDIC_PREFIX + b64)}`;
  const cacheDir = join(os.tmpdir(), "frdic-cache");
  // Standard Base64 may contain `/`, which would accidentally become a
  // directory separator in the cache path. Use a filesystem-safe Base64 key.
  const cacheKey = b64.replace(/\+/g, "-").replace(/\//g, "_");
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

export async function pronounceText(raw: string | null, emptyMessage: string): Promise<void> {
  const text = raw ? trimSelectedText(raw) : null;
  if (!text) {
    await showHUD(emptyMessage);
    return;
  }

  try {
    await playAudio(text);
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }
}

export default async function Command() {
  // Read selected text only. This command never reads the clipboard.
  let raw: string | null = null;
  try {
    raw = await getRaycastSelectedText();
  } catch {
    raw = null;
  }

  await pronounceText(raw, "No selected text found — select text first");
}
