import { usePromise } from "@raycast/utils";
import { useSyncExternalStore } from "react";
import { wordChats } from "./word-chat-runtime";

export function useChatPresence(libraryId: string, wordIds: readonly string[]) {
  const revision = useSyncExternalStore(
    wordChats.subscribeToPresence,
    wordChats.getPresenceRevision,
  );
  const batch = JSON.stringify([...new Set(wordIds)]);
  const { data } = usePromise(
    async (library: string, ids: string, version: number) => ({
      version,
      library,
      ids,
      hits: new Set(await wordChats.wordsWithHistory(library, JSON.parse(ids))),
    }),
    [libraryId, batch, revision] as const,
    { execute: !!libraryId && wordIds.length > 0, onError: () => {} },
  );
  return data?.library === libraryId &&
    data.ids === batch &&
    data.version === revision
    ? data.hits
    : undefined;
}
