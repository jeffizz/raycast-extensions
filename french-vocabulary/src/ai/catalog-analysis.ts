import { ModelOption } from "./model-catalog";
export type ModelAdvice = {
  id: string;
  status: "recommended" | "suitable" | "unknown" | "not_recommended";
  strengths: string;
  reason: string;
};
export function validateAdvice(
  raw: string[],
  models: ModelOption[],
): ModelAdvice[] {
  const allowed = new Set(models.map((m) => m.id));
  const seen = new Set<string>();
  return raw.map((text) => {
    const item = JSON.parse(text) as ModelAdvice;
    if (!item || !allowed.has(item.id))
      throw Error(
        "Model analysis returned an unknown model ID; expected: " +
          [...allowed].join(", "),
      );
    if (seen.has(item.id))
      throw Error("Model analysis repeated model ID: " + item.id);
    if (
      !item ||
      !allowed.has(item.id) ||
      seen.has(item.id) ||
      !["recommended", "suitable", "unknown", "not_recommended"].includes(
        item.status,
      ) ||
      typeof item.strengths !== "string" ||
      typeof item.reason !== "string" ||
      item.strengths.length > 1500 ||
      item.reason.length > 1500
    )
      throw Error(
        "Invalid analysis for " +
          item.id +
          ": expected status recommended/suitable/unknown/not_recommended and string fields strengths/reason (up to 1500 characters).",
      );
    seen.add(item.id);
    return {
      id: item.id,
      status: item.status,
      strengths: item.strengths,
      reason: item.reason,
    };
  });
}
export function adviceRank(
  model: ModelOption,
  advice: ModelAdvice | undefined,
  blocked: boolean,
) {
  return blocked
    ? 4
    : advice?.status === "recommended"
      ? 0
      : advice?.status === "suitable"
        ? 1
        : advice?.status === "not_recommended"
          ? 3
          : 2;
}
export function modelPrice(model: ModelOption) {
  const price = model.pricing;
  return price
    ? "Provider catalog pricing (USD per token): input " +
        (typeof price.prompt === "string" ? price.prompt : "not provided") +
        "; output " +
        (typeof price.completion === "string"
          ? price.completion
          : "not provided") +
        ". Other charges may apply."
    : "Price not provided by this provider's model catalog. AI does not estimate prices.";
}
