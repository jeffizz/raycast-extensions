/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Random Strategy — Frdic Percentage - Chance of Frdic per pronunciation (0–100, default 50). ElevenLabs gets the remainder. Applies before cache lookup. Random mode does not fall back across providers. */
  "randomFrdicPercentage": string,
  /** Local Privacy Checks - Heuristically block emails, URLs, credentials, long digit strings and markup. Not a guarantee of privacy. The 175-character and control-character limits always apply. */
  "strictPrivacyChecks": boolean,
  /** ElevenLabs French Voice IDs - One or more Voice IDs separated by commas (or newlines if pasted). Randomly choose one per playback. Blank uses FvmvwvObRqIHojkEGh5N. Each voice must be available to the API key. */
  "elevenFrenchVoiceId": string,
  /** ElevenLabs English Voice IDs - One or more Voice IDs separated by commas (or newlines if pasted). Randomly choose one per playback. Blank uses bGnz83yTAb7caZSC7BBz. Each voice must be available to the API key. */
  "elevenEnglishVoiceId": string,
  /** ElevenLabs Model - Enter a model ID (letters, numbers, _, - or .). Examples: eleven_v4, eleven_v4_turbo, eleven_v3, eleven_multilingual_v2, eleven_flash_v2_5, eleven_turbo_v2_5. Blank uses eleven_v4. New IDs are sent without optional settings; check model access and documentation. */
  "elevenModel": string,
  /** ElevenLabs Speed - Legacy Flash/Turbo/Multilingual only: 0.7–1.2, normal 1.0. Not sent for Eleven v4/v3; v4 does not support speed control. */
  "elevenSpeed": string,
  /** ElevenLabs Stability - 0–1; default 0.65. Eleven v3 maps to the nearest supported 0, 0.5 or 1. Other models use the value directly. */
  "elevenStability": string,
  /** ElevenLabs Similarity - 0–1; default 0.75. Omitted for Eleven v3, which only accepts stability. */
  "elevenSimilarity": string,
  /** Frdic English Voice - Only affects frdic English pronunciation. Does not change ElevenLabs voices; those use the separate ElevenLabs English Voice ID. */
  "voicename": "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female",
  /** Translation Engine - Optional translation shown as a toast. Choose None to skip translation. */
  "translationEngine": "none" | "google" | "deepl",
  /** DeepL API Key - Required only when Translation Engine is DeepL. Free keys usually end with :fx. */
  "deeplApiKey"?: string,
  /** Translation Toast Duration (Seconds) - Optional. Leave empty for Raycast default behavior. Valid values are integers from 3 to 30. */
  "translationToastDurationSeconds"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `pronounce` command */
  export type Pronounce = ExtensionPreferences & {}
  /** Preferences accessible in the `pronounce-english` command */
  export type PronounceEnglish = ExtensionPreferences & {}
  /** Preferences accessible in the `cycle-speech-strategy` command */
  export type CycleSpeechStrategy = ExtensionPreferences & {}
  /** Preferences accessible in the `speech-strategy` command */
  export type SpeechStrategy = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-elevenlabs-keys` command */
  export type ManageElevenlabsKeys = ExtensionPreferences & {}
  /** Preferences accessible in the `toggle-translation` command */
  export type ToggleTranslation = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `pronounce` command */
  export type Pronounce = {}
  /** Arguments passed to the `pronounce-english` command */
  export type PronounceEnglish = {}
  /** Arguments passed to the `cycle-speech-strategy` command */
  export type CycleSpeechStrategy = {}
  /** Arguments passed to the `speech-strategy` command */
  export type SpeechStrategy = {}
  /** Arguments passed to the `manage-elevenlabs-keys` command */
  export type ManageElevenlabsKeys = {}
  /** Arguments passed to the `toggle-translation` command */
  export type ToggleTranslation = {}
}

