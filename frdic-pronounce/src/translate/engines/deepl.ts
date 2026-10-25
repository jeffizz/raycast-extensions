import { getPreferences } from "../../preferences";
import type { TranslationEngine, TranslateRequest } from "../types";

function deeplLanguage(code: TranslateRequest["source"] | TranslateRequest["target"]): string | undefined {
  if (code === "auto") return undefined;
  if (code === "zh") return "ZH";
  return code.toUpperCase();
}

function deeplEndpoint(apiKey: string): string {
  const host = apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  return `${host}/v2/translate`;
}

export const deeplEngine: TranslationEngine = {
  id: "deepl",
  title: "DeepL",
  async translate({ text, source, target }: TranslateRequest): Promise<string> {
    const apiKey = getPreferences().deeplApiKey?.trim();
    if (!apiKey) {
      throw new Error("DeepL API key is missing");
    }

    const body: Record<string, unknown> = {
      text: [text],
      target_lang: deeplLanguage(target),
    };
    const sourceLang = deeplLanguage(source);
    if (sourceLang) {
      body.source_lang = sourceLang;
    }

    const response = await fetch(deeplEndpoint(apiKey), {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`DeepL ${response.status}`);
    }

    const data = (await response.json()) as { translations?: Array<{ text?: string }> };
    const translated = data.translations?.[0]?.text?.trim();
    if (!translated) {
      throw new Error("DeepL returned empty text");
    }

    return translated;
  },
};
