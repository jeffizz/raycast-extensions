/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** English Voice - Voice used by the English pronunciation commands */
  "voicename": "en_uk_male" | "en_uk_female" | "en_us_male" | "en_us_female",
  /** Translation Engine - Optional translation shown as a toast. Choose None to skip translation. */
  "translationEngine": "none" | "google" | "deepl",
  /** DeepL API Key - Required only when Translation Engine is DeepL. Free keys usually end with :fx. */
  "deeplApiKey"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `pronounce` command */
  export type Pronounce = ExtensionPreferences & {}
  /** Preferences accessible in the `pronounce-clipboard` command */
  export type PronounceClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `pronounce-english` command */
  export type PronounceEnglish = ExtensionPreferences & {}
  /** Preferences accessible in the `pronounce-english-clipboard` command */
  export type PronounceEnglishClipboard = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `pronounce` command */
  export type Pronounce = {}
  /** Arguments passed to the `pronounce-clipboard` command */
  export type PronounceClipboard = {}
  /** Arguments passed to the `pronounce-english` command */
  export type PronounceEnglish = {}
  /** Arguments passed to the `pronounce-english-clipboard` command */
  export type PronounceEnglishClipboard = {}
}

