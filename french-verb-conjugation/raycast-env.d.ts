/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** 显示其他变位形式 - 关闭时，每格仅显示词库中的第一种形式；打开时，用 / 分隔显示所有形式。 */
  "showAlternateForms": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `lookup` command */
  export type Lookup = ExtensionPreferences & {}
  /** Preferences accessible in the `practice` command */
  export type Practice = ExtensionPreferences & {}
  /** Preferences accessible in the `practice-mine` command */
  export type PracticeMine = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `lookup` command */
  export type Lookup = {}
  /** Arguments passed to the `practice` command */
  export type Practice = {}
  /** Arguments passed to the `practice-mine` command */
  export type PracticeMine = {}
}

