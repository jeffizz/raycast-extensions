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
