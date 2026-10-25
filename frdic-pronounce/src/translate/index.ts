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

const MIN_TOAST_DURATION_SECONDS = 3;
const MAX_TOAST_DURATION_SECONDS = 30;

export function getConfiguredEngine(): TranslationEngine | null {
  const { translationEngine } = getPreferences();
  if (!translationEngine || translationEngine === "none") {
    return null;
  }

  return engines[translationEngine] ?? null;
}

function getConfiguredToastDurationSeconds(): number | null {
  const { translationToastDurationSeconds } = getPreferences();
  const rawValue = translationToastDurationSeconds?.trim();

  if (!rawValue) {
    return null;
  }

  const durationSeconds = Number(rawValue);
  const isValidInteger = Number.isInteger(durationSeconds);

  if (!isValidInteger || durationSeconds < MIN_TOAST_DURATION_SECONDS || durationSeconds > MAX_TOAST_DURATION_SECONDS) {
    return null;
  }

  return durationSeconds;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

    const durationSeconds = getConfiguredToastDurationSeconds();

    if (durationSeconds === null) {
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
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: translated,
      primaryAction: {
        title: "Copy",
        onAction: async () => {
          await Clipboard.copy(translated);
        },
      },
    });

    await sleep(durationSeconds * 1000);
    toast.hide();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Translation failed",
      message: (error as Error).message,
    });
  }
}
