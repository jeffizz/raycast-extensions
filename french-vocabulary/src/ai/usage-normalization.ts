export function normalizeUsage(raw: Record<string, unknown>) {
  const number = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
  return {
    input: number(
      raw.prompt_tokens ?? raw.promptTokenCount ?? raw.input_tokens,
    ),
    output:
      number(raw.completion_tokens ?? raw.output_tokens) ??
      (number(raw.candidatesTokenCount) !== undefined
        ? (number(raw.candidatesTokenCount) ?? 0) +
          (number(raw.thoughtsTokenCount) ?? 0)
        : undefined),
  };
}
