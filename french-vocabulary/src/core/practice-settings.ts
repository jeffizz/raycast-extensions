import { matchesWordFilters } from "./vocabulary-filters";
import {
  collectionSelectionKey,
  collectionSelectionMembers,
} from "./collections";
import {
  Library,
  Mode,
  ModeSettings,
  PracticeSourceFilters,
  Word,
} from "./model";
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
export function practiceSourceFilters(
  settings: ModeSettings,
): PracticeSourceFilters {
  if (settings.sourceFilters)
    return {
      ...settings.sourceFilters,
      collectionId:
        settings.sourceFilters.collectionIds !== undefined
          ? collectionSelectionKey(settings.sourceFilters.collectionIds)
          : settings.sourceFilters.collectionId,
    };
  return {
    collectionId: "",
    pos: "all",
    familiarity:
      settings.scope === "known"
        ? "known"
        : settings.scope === "fuzzy"
          ? "fuzzy"
          : "all",
  };
}
export function modeIncludes(
  lib: Library,
  mode: Mode,
  wordId: string,
  scope?: ModeSettings["scope"],
  candidate?: Word,
) {
  const settings = modeSettings(lib, mode);
  const source = scope ?? settings.scope;
  const word = candidate ?? lib.words.find((w) => w.id === wordId);
  if (!word) return false;
  if (scope !== undefined) {
    if (scope === "default") return true;
    if (scope === "selected") return settings.wordIds.includes(wordId);
    return matchesWordFilters(word, "all", scope);
  }
  if (source === "selected" && !settings.wordIds.includes(wordId)) return false;
  const filters = practiceSourceFilters(settings);
  if (!matchesWordFilters(word, filters.pos, filters.familiarity)) return false;
  return (
    !filters.collectionId ||
    !!collectionSelectionMembers(lib, filters.collectionId)?.includes(wordId)
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
