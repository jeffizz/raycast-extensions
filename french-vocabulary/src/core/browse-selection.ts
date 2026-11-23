import { Familiarity, Library, now } from "./model";

export type RangeStart = { wordId: string; order: string[] };
export function startSelectionRange(
  order: string[],
  wordId: string,
): RangeStart {
  const ids = [...new Set(order)];
  if (!ids.includes(wordId))
    throw Error("The range start is not in the current results.");
  return { wordId, order: ids };
}
export function selectWordRange(
  order: string[],
  start: RangeStart,
  endId: string,
): string[] {
  const ids = [...new Set(order)];
  if (
    ids.length !== start.order.length ||
    ids.some((id, index) => id !== start.order[index])
  )
    throw Error(
      "The order or filtered results changed. Set the range start again.",
    );
  const a = ids.indexOf(start.wordId),
    b = ids.indexOf(endId);
  if (a < 0 || b < 0)
    throw Error("A range endpoint is no longer in the current results.");
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}
export function setSelectionFamiliarity(
  lib: Library,
  ids: string[],
  familiarity: Familiarity,
) {
  const selected = new Set(ids);
  const at = now();
  for (const word of lib.words) {
    if (!selected.has(word.id)) continue;
    word.familiarity = familiarity;
    delete word.meaningFamiliaritySuccessStreak;
    word.updatedAt = at;
  }
}
