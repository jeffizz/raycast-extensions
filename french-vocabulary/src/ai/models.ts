import { LocalStorage } from "@raycast/api";
import { Provider } from "./core";
import { ModelOption, parseModels } from "./model-catalog";
export {
  recommendations,
  parseModels,
  type ModelOption,
} from "./model-catalog";
export const modelCacheKey = (provider: Provider) =>
  "ai-model-list-v1-" + provider;
export async function fetchModels(
  provider: Provider,
  key: string,
  signal: AbortSignal,
): Promise<ModelOption[]> {
  if (!key.trim() && provider !== "openrouter")
    throw Error("Enter an API key first.");
  const urls = {
    openai: "https://api.openai.com/v1/models",
    deepseek: "https://api.deepseek.com/models",
    openrouter: "https://openrouter.ai/api/v1/models",
    gemini:
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
  };
  const result: ModelOption[] = [];
  let token = "";
  for (let page = 0; page < 10; page++) {
    const url =
      urls[provider] + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers:
        provider === "gemini"
          ? { "x-goog-api-key": key }
          : key
            ? { Authorization: "Bearer " + key }
            : {},
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        "Model list failed (HTTP " +
          response.status +
          "). Use cached models or retry model discovery.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error("Empty model list.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw Error("Model list exceeds size limit.");
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    result.push(...parseModels(provider, data));
    token = provider === "gemini" ? (data.nextPageToken ?? "") : "";
    if (!token) break;
    if (page === 9)
      throw Error("Too many model pages. Enter a model ID manually.");
  }
  const models = [...new Map(result.map((m) => [m.id, m])).values()];
  await LocalStorage.setItem(modelCacheKey(provider), JSON.stringify(models));
  return models;
}
