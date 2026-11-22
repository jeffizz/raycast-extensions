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
  const saved = lib.settings?.practice?.[mode];
  // Legacy selected lists no longer restrict practice. Keep old backups readable.
  if (saved?.scope === "selected")
    return { ...saved, scope: "default", wordIds: [] };
  return (
    saved ?? {
      autoSpeak: false,
      scope: "default",
      wordIds: [],
    }
  );
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
  const word = candidate ?? lib.words.find((w) => w.id === wordId);
  if (!word) return false;
  if (scope !== undefined) {
    if (scope === "default" || scope === "selected") return true;
    return matchesWordFilters(word, "all", scope);
  }
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
