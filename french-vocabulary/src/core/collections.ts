import { canonical, Library, uid } from "./model";

export function collections(lib: Library) {
  return lib.settings?.collections ?? [];
}
export function collectionById(lib: Library, id: string) {
  const result = collections(lib).find((c) => c.id === id);
  if (!result)
    throw Error(
      "Collection no longer exists. Refresh and choose another collection.",
    );
  return result;
}
export function collectionName(lib: Library, name: string, exceptId?: string) {
  const result = canonical(name);
  if (!result || result.length > 200)
    throw Error("Enter a collection name from 1 to 200 characters.");
  if (
    collections(lib).some(
      (c) =>
        c.id !== exceptId &&
        canonical(c.name).toLocaleLowerCase() === result.toLocaleLowerCase(),
    )
  )
    throw Error("A collection with this name already exists.");
  return result;
}
export function createCollection(lib: Library, name: string) {
  const clean = collectionName(lib, name);
  lib.settings ??= {};
  lib.settings.collections ??= [];
  const result = { id: uid(), name: clean, wordIds: [] as string[] };
  lib.settings.collections.push(result);
  return result.id;
}
export function renameCollection(lib: Library, id: string, name: string) {
  collectionById(lib, id).name = collectionName(lib, name, id);
}
export function deleteCollection(lib: Library, id: string) {
  collectionById(lib, id);
  lib.settings!.collections = collections(lib).filter((c) => c.id !== id);
}
export function changeCollectionMembers(
  lib: Library,
  id: string,
  ids: string[],
  add: boolean,
) {
  const collection = collectionById(lib, id);
  const existing = new Set(lib.words.map((w) => w.id));
  const selected = new Set(ids.filter((id) => existing.has(id)));
  collection.wordIds = add
    ? [...new Set([...collection.wordIds, ...selected])]
    : collection.wordIds.filter((id) => !selected.has(id));
}
export function collectionWordIds(
  lib: Library,
  id: string,
): string[] | undefined {
  return id ? collectionById(lib, id).wordIds : undefined;
}
export function addImportedWordsToCollection(
  lib: Library,
  id: string,
  spellings: string[],
) {
  const names = new Set(spellings.map(canonical).filter(Boolean));
  changeCollectionMembers(
    lib,
    id,
    lib.words.filter((w) => names.has(canonical(w.word))).map((w) => w.id),
    true,
  );
}
