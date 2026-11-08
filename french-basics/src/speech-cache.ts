import { promises as fs } from "fs";
import { join } from "path";
import { createHash, randomUUID } from "crypto";

const pending = new Map<string, Promise<string>>();
export function isAudio(data: Uint8Array): boolean {
  return data.length >= 100 && ((data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0));
}

export async function cachedSpeech(directory: string, text: string, fetchAudio: () => Promise<Uint8Array>, legacyFile?: string): Promise<string> {
  const file = join(directory, createHash("sha256").update("frdic:fr:v1:" + text.normalize("NFC")).digest("hex") + ".mp3");
  const existing = pending.get(file);
  if (existing) return existing;
  const work = (async () => {
    await fs.mkdir(directory, { recursive: true });
    try { if (isAudio(await fs.readFile(file))) return file; } catch { /* cache miss */ }
    let audio: Uint8Array | undefined;
    if (legacyFile) {
      try { const old = await fs.readFile(legacyFile); if (isAudio(old)) audio = old; } catch { /* no legacy entry */ }
    }
    audio ??= await fetchAudio();
    if (!isAudio(audio)) throw new Error("frdic 未返回有效 MP3 音频");
    const temporary = file + "." + randomUUID() + ".tmp";
    try { await fs.writeFile(temporary, audio); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
    return file;
  })();
  pending.set(file, work);
  try { return await work; } finally { pending.delete(file); }
}
