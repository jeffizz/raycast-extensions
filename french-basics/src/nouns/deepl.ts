import { createHash } from "crypto";
export type DeepLPlan = "free" | "pro";

export type TranslationStore = {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<unknown>;
};

export async function cachedNounTranslations(texts: string[], key: string | undefined, plan: DeepLPlan, store: TranslationStore, signal?: AbortSignal): Promise<Record<string, string>> {
  const rows = await Promise.all([...new Set(texts)].map(async (text) => {
    const cacheKey = "noun-deepl-v2:" + createHash("sha256").update(text.normalize("NFC")).digest("hex");
    return { text, cacheKey, value: await store.getItem(cacheKey) };
  }));
  const missing = rows.filter((row) => !row.value?.trim());
  if (missing.length && key) {
    const translated = await translateNouns(missing.map((row) => row.text), key, plan, signal);
    for (let i = 0; i < missing.length; i++) {
      if (!translated[i]?.trim()) throw new Error("DeepL 返回空翻译");
      missing[i].value = translated[i];
      await store.setItem(missing[i].cacheKey, translated[i]);
    }
  }
  return Object.fromEntries(rows.filter((row) => row.value).map((row) => [row.text, row.value!]));
}

type TranslationResponse = { translations?: { text: string }[]; message?: string };

/** Translate explicit noun/article combinations, not the user's original clipboard. */
export async function translateNouns(texts: string[], key: string, plan: DeepLPlan, signal?: AbortSignal): Promise<string[]> {
  const endpoint = plan === "pro" ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texts, source_lang: "FR", target_lang: "ZH" }),
    signal,
  });
  if (!response.ok) throw new Error(`DeepL 翻译失败（HTTP ${response.status}）；请检查 API Key、套餐和额度。`);
  const data = (await response.json()) as TranslationResponse;
  if (!Array.isArray(data.translations) || data.translations.length !== texts.length) {
    throw new Error("DeepL 返回的数据不完整。");
  }
  return data.translations.map((translation) => translation.text);
}
