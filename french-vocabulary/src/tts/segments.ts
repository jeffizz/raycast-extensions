// Keep phrase-internal spaces intact: un ami still needs its normal liaison.
export function speechSegments(texts: string[]): string[] {
  return texts.map((text) => text.trim()).filter(Boolean);
}
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : text + ".");
export function frdicSpeechText(texts: string[]): string {
  const parts = speechSegments(texts);
  if (parts.length < 2) return parts[0] ?? "";
  // The reference conjugation formatter uses punctuation plus tabs for boundaries.
  return parts
    .map((part, i) => (i < parts.length - 1 ? sentence(part) : part))
    .join("\t");
}
export function elevenSpeechText(texts: string[], model: string): string {
  const parts = speechSegments(texts);
  if (parts.length < 2) return parts[0] ?? "";
  if (["eleven_v3", "eleven_v4", "eleven_v4_turbo"].includes(model)) {
    return parts.map(sentence).join(" [short pause] ");
  }
  if (
    [
      "eleven_multilingual_v2",
      "eleven_flash_v2_5",
      "eleven_turbo_v2_5",
      "eleven_flash_v2",
      "eleven_turbo_v2",
    ].includes(model)
  ) {
    const escape = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return parts
      .map((part) => escape(sentence(part)))
      .join(' <break time="0.8s" /> ');
  }
  // Do not assume support for markup in an unknown future model.
  return parts.map(sentence).join("\n\n");
}
