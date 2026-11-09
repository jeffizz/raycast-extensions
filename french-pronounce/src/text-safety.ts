export const MAX_TEXT_CHARACTERS = 175;

export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** Local-only heuristics, not a guarantee that text contains no personal data. */
export function validateText(raw: string, strict = true): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\p{Cf}\p{Cs}]/u.test(raw)) {
    throw new Error("Text contains hidden/control characters; nothing was sent");
  }
  const text = raw.normalize("NFC").trim();
  if (!text) throw new Error("No selected text found — select text first");
  if (characterCount(text) > MAX_TEXT_CHARACTERS) {
    throw new Error(`Maximum ${MAX_TEXT_CHARACTERS} characters; nothing was sent`);
  }
  if (!/[\p{L}\p{N}]/u.test(text)) throw new Error("Select a word or sentence; nothing was sent");
  if (strict) {
    const suspicious = [
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|ca|fr)\b)/i,
      /(?:\b(?:sk|pk)[_-][a-z0-9_-]{12,}|\bBearer\s+\S+|-----BEGIN\b)/i,
      /\b(?:api[_ -]?key|password|passwd|secret|token)\s*[:=]\s*\S+/i,
      /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i,
      /(?:\d[ .()+-]*){8,}/,
      /(?:\/(?:Users|home|etc|private|var)\/|\b[A-Z]:\\|[<>])/i,
      /\b[a-z0-9_+\/-]{32,}={0,2}\b/i,
    ];
    if (suspicious.some((pattern) => pattern.test(text))) {
      throw new Error("Possible private data, URL, credential or markup detected; nothing was sent");
    }
  }
  return text;
}
