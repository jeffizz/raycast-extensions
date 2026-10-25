import type { TranslationEngine, TranslateRequest } from "../types";

const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

function googleLanguage(code: TranslateRequest["source"] | TranslateRequest["target"]): string {
  if (code === "zh") return "zh-CN";
  if (code === "auto") return "auto";
  return code;
}

export const googleEngine: TranslationEngine = {
  id: "google",
  title: "Google",
  async translate({ text, source, target }: TranslateRequest): Promise<string> {
    const url = new URL(GOOGLE_ENDPOINT);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("dt", "t");
    url.searchParams.set("sl", googleLanguage(source));
    url.searchParams.set("tl", googleLanguage(target));
    url.searchParams.set("q", text);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Google Translate ${response.status}`);
    }

    const data: unknown = await response.json();
    const segments = Array.isArray(data) ? data[0] : null;
    if (!Array.isArray(segments)) {
      throw new Error("Google Translate returned an unexpected response");
    }

    const translated = segments
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
      .join("")
      .trim();

    if (!translated) {
      throw new Error("Google Translate returned empty text");
    }

    return translated;
  },
};
