const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export function isMp3(data: Buffer): boolean {
  if (data.length < 100 || data.length > MAX_AUDIO_BYTES) return false;
  if (data.subarray(0, 3).toString("ascii") === "ID3") return true;
  return (
    data[0] === 0xff && (data[1] & 0xe0) === 0xe0 && (data[1] & 0x06) !== 0
  );
}

export async function readMp3Response(response: Response): Promise<Buffer> {
  const type = response.headers.get("content-type")?.split(";")[0].trim();
  if (
    type &&
    ![
      "audio/mpeg",
      "audio/mp3",
      "application/octet-stream",
      "binary/octet-stream",
    ].includes(type)
  ) {
    await response.body?.cancel();
    throw new Error("Provider returned non-audio content");
  }
  if (!response.body) throw new Error("Provider returned no audio");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error("Audio response too large");
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    await reader.cancel();
  }
  const buffer = Buffer.concat(chunks);
  if (!isMp3(buffer))
    throw new Error("Provider returned invalid or empty MP3 audio");
  return buffer;
}
