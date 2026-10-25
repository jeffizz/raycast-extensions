import { getPreferenceValues } from "@raycast/api";

export type VoiceName = "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female";
export type TranslationEngineId = "none" | "google" | "deepl";

export interface Preferences {
  voicename: VoiceName;
  translationEngine: TranslationEngineId;
  deeplApiKey?: string;
  translationToastDurationSeconds?: string;
}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}
