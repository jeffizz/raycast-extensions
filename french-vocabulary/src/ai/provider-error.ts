export class AIRequestError extends Error {
  constructor(
    public status: number,
    public provider: string,
    public model: string,
    detail: string,
  ) {
    super(provider + " / " + model + " (HTTP " + status + "): " + detail);
    this.name = "AIRequestError";
  }
}
export async function providerErrorDetail(response: Response, key: string) {
  const reader = response.body?.getReader();
  if (!reader) return "No provider error details.";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value.subarray(0, 8192 - size));
      size += value.length;
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let message = "No structured provider error details.";
    try {
      const data = JSON.parse(raw);
      if (typeof data.error?.message === "string") message = data.error.message;
    } catch {
      /* Never expose HTML or arbitrary response bodies. */
    }
    if (key) message = message.split(key).join("[REDACTED]");
    return message
      .replace(/AIza[\w-]+|sk-[\w-]+|Bearer\s+\S+/gi, "[REDACTED]")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 600);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
