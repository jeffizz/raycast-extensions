import { Library, Mode, ModeSettings } from "./model";
export const practiceModes: { mode: Mode; title: string }[] = [
  { mode: "copy", title: "Copy Spelling" },
  { mode: "meaning", title: "Recall Meaning" },
  { mode: "spelling", title: "Recall Spelling" },
  { mode: "gender", title: "Noun Gender" },
];
export function modeSettings(lib: Library, mode: Mode): ModeSettings {
  return (
    lib.settings?.practice?.[mode] ?? {
      autoSpeak: false,
      scope: "default",
      wordIds: [],
    }
  );
}
// Append without replacing existing mode selections or pronunciation preferences.
export function addModeWords(lib: Library, ids: string[], targets: string[]) {
  lib.settings ??= {};
  lib.settings.practice ??= {};
  for (const { mode } of practiceModes) {
    if (!targets.includes(mode)) continue;
    const setting = modeSettings(lib, mode);
    lib.settings.practice[mode] = {
      ...setting,
      scope: "selected",
      wordIds: [...new Set([...setting.wordIds, ...ids])],
    };
  }
}
export function modeIncludes(
  lib: Library,
  mode: Mode,
  wordId: string,
  scope?: "default" | "selected",
) {
  const settings = modeSettings(lib, mode);
  return (
    (scope ?? settings.scope) === "default" || settings.wordIds.includes(wordId)
  );
}

export function toggleAutoSpeak(lib: Library, mode: Mode): boolean {
  lib.settings ??= {};
  lib.settings.practice ??= {};
  const settings = modeSettings(lib, mode);
  const autoSpeak = !settings.autoSpeak;
  lib.settings.practice[mode] = { ...settings, autoSpeak };
  return autoSpeak;
}
