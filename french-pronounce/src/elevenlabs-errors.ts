const MAX_ERROR_BYTES = 16 * 1024;

function redact(value: string, sensitive: string[]): string {
  let safe = value;
  for (const secret of sensitive.filter(Boolean).sort((a, b) => b.length - a.length)) {
    safe = safe.split(secret).join("[redacted]");
    const encoded = JSON.stringify(secret).slice(1, -1);
    safe = safe.split(encoded).join("[redacted]");
  }
  return safe
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk)[_-][a-z0-9_-]+/gi, "[redacted]")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[a-z0-9_-]{32,}\b/gi, "[identifier]")
    .replace(/[\p{Cc}\p{Cf}`]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Accept only bounded JSON error fields, not arbitrary HTML/raw bodies. */
export async function describeElevenError(response: Response, sensitive: string[]): Promise<string> {
  const prefix = `HTTP ${response.status}`;
  let body: unknown;
  try {
    if (!response.body) return prefix;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ERROR_BYTES) return prefix;
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel(); }
  } catch { return prefix; }
  if (!body || typeof body !== "object") return prefix;
  const root = body as Record<string, unknown>;
  const detail = root.detail && typeof root.detail === "object" && !Array.isArray(root.detail)
    ? root.detail as Record<string, unknown> : root;
  const codes = [detail.code, detail.status, detail.type]
    .filter((value): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(value))
    .map((value) => redact(value, sensitive));
  const message = typeof detail.message === "string" ? redact(detail.message, sensitive) : "";
  const code = [...new Set(codes)].join(" / ");
  return `${prefix}${code ? ` [${code}]` : ""}${message ? `: ${message}` : ""}`;
}
