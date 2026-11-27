import { environment } from "@raycast/api";
import { WordChatStore } from "../core/word-chat";
import { backupWordChats } from "../core/word-chat-backup";
import { preferences, store, webdavConfig } from "../runtime";

export const wordChats = new WordChatStore(environment.supportPath);
export async function chatLibraryId() {
  const header = await store.getMeta<{ libraryId: string }>("header");
  if (!header) throw Error("Vocabulary library is unavailable.");
  return header.libraryId;
}

export async function autoBackupWordChats(libraryId: string) {
  if (preferences().autoBackup && preferences().webdavUrl)
    await backupWordChats(wordChats, webdavConfig(), libraryId);
}
