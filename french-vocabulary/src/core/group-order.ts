import { Group, Library } from "./model";
export function reorderedGroupName(
  name: string,
  before: string[],
  after: string[],
  words: Map<string, string>,
) {
  if (before.some((id) => !words.has(id))) return name;
  const oldWords = before.map((id) => words.get(id)!);
  const automatic =
    name === [...new Set(oldWords)].join(", ") || name === oldWords.join(" · ");
  return automatic
    ? [...new Set(after.map((id) => words.get(id)!))].join(", ")
    : name;
}
export function orderedGroupWords(lib: Library, group: Group) {
  const words = new Map(lib.words.map((w) => [w.id, w]));
  return group.wordIds.flatMap((id) => {
    const word = words.get(id);
    return word ? [word] : [];
  });
}
export function sortedGroupIds(
  lib: Library,
  group: Group,
  order: "alphabetical" | "library",
) {
  const members = new Set(group.wordIds);
  const words =
    order === "library"
      ? lib.words.filter((w) => members.has(w.id))
      : orderedGroupWords(lib, group).sort((a, b) =>
          a.word.localeCompare(b.word, "fr"),
        );
  return words.map((w) => w.id);
}
export function moveGroupWord(ids: string[], id: string, direction: -1 | 1) {
  const result = [...ids],
    index = result.indexOf(id),
    target = index + direction;
  if (index >= 0 && target >= 0 && target < result.length)
    [result[index], result[target]] = [result[target], result[index]];
  return result;
}
