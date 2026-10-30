import { getPreferenceValues } from "@raycast/api";

export type VoiceName = "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female";
export type PronunciationModeId = "on" | "off";
export type TranslationEngineId = "none" | "google" | "deepl";
export type TranslationDisplayModeId = "toast" | "page";

export interface Preferences {
  voicename: VoiceName;
  pronunciationEnabled: PronunciationModeId;
  translationEngine: TranslationEngineId;
  deeplApiKey?: string;
  translationDisplayMode: TranslationDisplayModeId;
  translationToastDurationSeconds?: string;
}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function isPronunciationEnabled(): boolean {
  return getPreferences().pronunciationEnabled !== "off";
}

export function getTranslationDisplayMode(): TranslationDisplayModeId {
  return getPreferences().translationDisplayMode === "page" ? "page" : "toast";
}
