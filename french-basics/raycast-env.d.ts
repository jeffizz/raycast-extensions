/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** DeepL API Key - 可选：用于法语名词查询的 DeepL API Key。 */
  "deepLApiKey"?: string,
  /** DeepL API Plan - 选择与密钥对应的 DeepL API 套餐。 */
  "deepLApiPlan": "free" | "pro"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `index` command */
  export type Index = ExtensionPreferences & {}
  /** Preferences accessible in the `noun-lookup` command */
  export type NounLookup = ExtensionPreferences & {}
  /** Preferences accessible in the `speak-selected-noun` command */
  export type SpeakSelectedNoun = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `index` command */
  export type Index = {}
  /** Arguments passed to the `noun-lookup` command */
  export type NounLookup = {}
  /** Arguments passed to the `speak-selected-noun` command */
  export type SpeakSelectedNoun = {}
}

