import type { Mode, Sense, Word } from "./model";
import type { LanguageMode } from "./presentation";
import { translationValues } from "./presentation";
import { checkAnswer } from "./learning";

export function optionalMeaningSpelling(
  answer: string,
  expected: string,
  revealed: boolean,
) {
  if (!revealed || !answer.trim() || checkAnswer(answer, expected).correct)
    return undefined;
  return { expected, answer };
}
export function practiceLayoutKey(mode: Mode) {
  return mode === "copy"
    ? "copy-spelling-list-layout"
    : `practice-list-layout-${mode}`;
}
export function supportsDelayedPronunciation(mode: Mode) {
  return mode === "copy" || mode === "spelling" || mode === "meaning";
}
export function practiceListRow(
  word: Word,
  sense: Sense,
  mode: Mode,
  position: number,
  current: number,
  revealed: boolean,
  language: LanguageMode | undefined,
) {
  const shown = position < current || (position === current && revealed);
  return {
    title: mode === "spelling" && !shown ? String(position + 1) : word.word,
    subtitle: [
      sense.pos,
      ...(mode === "meaning" && !shown
        ? []
        : translationValues(sense, language)),
    ]
      .filter(Boolean)
      .join(" · ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}
