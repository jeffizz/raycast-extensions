import { Clipboard, showToast, Toast } from "@raycast/api";
import { getPreferences } from "../preferences";
import { isTranslationEnabled } from "../translation-toggle";
import { deeplEngine } from "./engines/deepl";
import { googleEngine } from "./engines/google";
import type { SourceLanguage, TranslationEngine } from "./types";

/**
 * Register additional engines here. The preference dropdown should use the
 * same ids, plus `none` for "do not translate".
 */
const engines: Record<string, TranslationEngine> = {
  google: googleEngine,
  deepl: deeplEngine,
};

export function getConfiguredEngine(): TranslationEngine | null {
  const { translationEngine } = getPreferences();
  if (!translationEngine || translationEngine === "none") {
    return null;
  }

  return engines[translationEngine] ?? null;
}

export async function showTranslationIfEnabled(text: string, source: SourceLanguage): Promise<void> {
  if (!(await isTranslationEnabled())) {
    return;
  }

  const engine = getConfiguredEngine();
  if (!engine) {
    return;
  }

  const sourceText = text.trim();
  if (!sourceText) {
    return;
  }

  try {
    const translated = await engine.translate({
      text: sourceText,
      source,
      target: "zh",
    });

    await showToast({
      style: Toast.Style.Success,
      title: translated,
      primaryAction: {
        title: "Copy",
        onAction: async () => {
          await Clipboard.copy(translated);
        },
      },
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Translation failed",
      message: (error as Error).message,
    });
  }
}
