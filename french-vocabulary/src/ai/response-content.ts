import type { Provider } from "./core";

type ResponseData = {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: unknown;
      refusal?: unknown;
      reasoning_content?: unknown;
    };
  }[];
  candidates?: {
    finishReason?: string;
    content?: { parts?: { thought?: boolean; text?: unknown }[] };
  }[];
  promptFeedback?: { blockReason?: string };
};
export function extractResponseContent(
  value: unknown,
  provider: Provider,
): string {
  const data = value as ResponseData;
  const choice = data?.choices?.[0];
  const candidate = data?.candidates?.[0];
  const finish =
    provider === "gemini" ? candidate?.finishReason : choice?.finish_reason;
  const prefix = provider + ": ";
  if (finish === "length" || finish === "MAX_TOKENS")
    throw Error(
      prefix +
        "Output token limit reached before a complete answer. No result saved. Retry explicitly; no automatic paid retry was made.",
    );
  if (
    finish === "content_filter" ||
    [
      "SAFETY",
      "RECITATION",
      "BLOCKLIST",
      "PROHIBITED_CONTENT",
      "SPII",
    ].includes(finish ?? "") ||
    data?.promptFeedback?.blockReason ||
    choice?.message?.refusal
  )
    throw Error(
      prefix +
        "The provider blocked or refused this response. No result saved.",
    );
  const content =
    provider === "gemini"
      ? candidate?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => (typeof p.text === "string" ? p.text : ""))
          .join("")
      : choice?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((p) =>
              p &&
              typeof p === "object" &&
              p.type === "text" &&
              typeof p.text === "string"
                ? p.text
                : "",
            )
            .join("")
        : "";
  if (!text.trim()) {
    const thinking =
      typeof choice?.message?.reasoning_content === "string" &&
      choice.message.reasoning_content.length > 0;
    throw Error(
      prefix +
        (thinking
          ? "Returned reasoning but no final answer."
          : "Returned no final text.") +
        " Check model compatibility or retry explicitly. No result saved.",
    );
  }
  return text;
}
// Simple vocabulary JSON tasks do not need DeepSeek's default thinking mode.
export function vocabularyRequestOptions(provider: Provider) {
  return provider === "deepseek"
    ? { thinking: { type: "disabled" as const } }
    : {};
}
