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

/** Provider codes meaning the account has no credits/quota left (any HTTP status). */
const CREDIT_CODES = new Set(["quota_exceeded", "insufficient_credits"]);

export interface ElevenFailure {
  description: string;
  /** True only for authentication failures (HTTP 401) or exhausted credits. Such keys are marked Invalid. */
  invalidatesKey: boolean;
}

/** Accept only bounded JSON error fields, not arbitrary HTML/raw bodies. */
export async function describeElevenFailure(response: Response, sensitive: string[]): Promise<ElevenFailure> {
  const prefix = `HTTP ${response.status}`;
  const plain = { description: prefix, invalidatesKey: classify(response.status, []) };
  let body: unknown;
  try {
    if (!response.body) return plain;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ERROR_BYTES) return plain;
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel(); }
  } catch { return plain; }
  if (!body || typeof body !== "object") return plain;
  const root = body as Record<string, unknown>;
  const detail = root.detail && typeof root.detail === "object" && !Array.isArray(root.detail)
    ? root.detail as Record<string, unknown> : root;
  // Codes are matched on the raw values; only the redacted text is ever stored.
  const rawCodes = [detail.code, detail.status, detail.type]
    .filter((value): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(value));
  const codes = rawCodes.map((value) => redact(value, sensitive));
  const message = typeof detail.message === "string" ? redact(detail.message, sensitive) : "";
  const code = [...new Set(codes)].join(" / ");
  return {
    description: `${prefix}${code ? ` [${code}]` : ""}${message ? `: ${message}` : ""}`,
    invalidatesKey: classify(response.status, rawCodes),
  };
}

/** Backward-compatible string form used for display only. */
export async function describeElevenError(response: Response, sensitive: string[]): Promise<string> {
  return (await describeElevenFailure(response, sensitive)).description;
}

/**
 * Only authentication (401) or credit exhaustion marks a key Invalid.
 * Everything else (403 plan/voice restrictions, 402 plan/billing notices, 400 model/voice,
 * 429, 5xx, timeouts, network, invalid audio) is recorded but does not disable the key.
 */
export function classify(status: number, codes: string[]): boolean {
  if (status === 401) return true;
  return codes.some((code) => CREDIT_CODES.has(code));
}
