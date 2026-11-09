import { getPreferenceValues } from "@raycast/api";

export type VoiceName = "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female";
export type TranslationEngineId = "none" | "google" | "deepl";

export interface Preferences {
  voicename: VoiceName;
  translationEngine: TranslationEngineId;
  deeplApiKey?: string;
  translationToastDurationSeconds?: string;
  strictPrivacyChecks?: boolean;
  elevenFrenchVoiceId?: string;
  elevenEnglishVoiceId?: string;
  elevenModel?: "eleven_v4" | "eleven_v3" | "eleven_flash_v2_5" | "eleven_turbo_v2_5" | "eleven_multilingual_v2";
  elevenSpeed?: string;
  elevenStability?: string;
  elevenSimilarity?: string;
}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}
