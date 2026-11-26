import { Library, VocabularyCollection } from "./model";
export type MembershipState = "all" | "none" | "mixed";
export function membershipState(
  collection: VocabularyCollection,
  ids: string[],
): MembershipState {
  const selected = new Set(ids);
  let count = 0;
  for (const id of collection.wordIds) if (selected.has(id)) count++;
  return count === 0 ? "none" : count === selected.size ? "all" : "mixed";
}
export function mixedCollectionMembership(
  collections: VocabularyCollection[],
  ids: string[],
) {
  const selected = new Set(ids);
  if (selected.size < 2) return false;
  return collections.some((collection) => {
    let count = 0;
    for (const id of collection.wordIds) if (selected.has(id)) count++;
    return count > 0 && count < selected.size;
  });
}
export function applyMembershipEdits(
  lib: Library,
  ids: string[],
  edits: Record<string, boolean>,
  before: VocabularyCollection[],
  addOnly = false,
) {
  if (addOnly && Object.values(edits).some((add) => !add))
    throw Error("Mixed selections only support adding to collections.");
  const selected = new Set(ids);
  for (const [id, add] of Object.entries(edits)) {
    const collection = lib.settings?.collections?.find((c) => c.id === id);
    const original = before.find((c) => c.id === id);
    if (!collection || !original || selected.size === 0)
      throw Error("Collections changed. Reopen the editor.");
    for (const wordId of selected)
      if (
        collection.wordIds.includes(wordId) !==
        original.wordIds.includes(wordId)
      )
        throw Error("Membership changed. Reopen the editor.");
    collection.wordIds = add
      ? [...new Set([...collection.wordIds, ...selected])]
      : collection.wordIds.filter((wordId) => !selected.has(wordId));
  }
}
