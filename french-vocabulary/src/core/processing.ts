import { Library, Word } from "./model";

export type ProcessingSession = {
  libraryId: string;
  ids: string[];
  total: number;
};

export function startProcessing(
  libraryId: string,
  words: Word[],
): ProcessingSession {
  const ids = [...new Set(words.map((w) => w.id))];
  return { libraryId, ids, total: ids.length };
}

export function processingWords(
  lib: Library,
  session: ProcessingSession,
  archived = false,
) {
  if (session.libraryId !== lib.libraryId) return [];
  const byId = new Map(lib.words.map((w) => [w.id, w]));
  return session.ids.flatMap((id) => {
    const w = byId.get(id);
    return w && w.archived === archived ? [w] : [];
  });
}

export function finishProcessingWord(
  session: ProcessingSession,
  id: string,
): ProcessingSession {
  return { ...session, ids: session.ids.filter((wordId) => wordId !== id) };
}
