import { createHash } from "node:crypto";
import { parseRemoteFiles, target, type BackupConfig } from "./backup";
import {
  CHAT_BACKUP_MAX,
  type ChatKey,
  type ChatSnapshot,
  type WordChatStore,
} from "./word-chat";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const folder = (libraryId: string) => `word-chat/v1/${digest(libraryId)}/`;
export const wordChatBackupName = (wordId: string) => `${digest(wordId)}.json`;
const backupTarget = (config: BackupConfig) =>
  digest(JSON.stringify([target(config), config.username]));
const strong = (etag: string | null) =>
  etag && /^"[^"\r\n]*"$/.test(etag) ? etag : null;

async function request(
  config: BackupConfig,
  path: string,
  init: RequestInit = {},
) {
  try {
    return await fetch(target(config) + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
        ...init.headers,
      },
    });
  } catch {
    throw Error("Word Chat could not connect to WebDAV.");
  }
}

async function read(response: Response) {
  if (!response.ok)
    throw Error(`Word Chat WebDAV request failed (HTTP ${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty WebDAV response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > CHAT_BACKUP_MAX) {
      await reader.cancel();
      throw Error("Word Chat backup exceeds the single-file safety limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function decodeChatSnapshot(
  raw: string,
  libraryId: string,
  name: string,
): ChatSnapshot {
  const s: ChatSnapshot = JSON.parse(raw);
  if (
    !s ||
    s.version !== 1 ||
    s.libraryId !== libraryId ||
    typeof s.wordId !== "string" ||
    wordChatBackupName(s.wordId) !== name ||
    typeof s.revision !== "string" ||
    s.revision.length > 100 ||
    !Array.isArray(s.turns) ||
    s.turns.some(
      (t) =>
        !t ||
        typeof t.id !== "string" ||
        t.id.length > 100 ||
        typeof t.question !== "string" ||
        !t.question.trim() ||
        t.question.length > 1500 ||
        (t.answer !== null &&
          (typeof t.answer !== "string" ||
            !t.answer.trim() ||
            t.answer.length > 6000)) ||
        typeof t.sense !== "string" ||
        t.sense.length > 250,
    ) ||
    new Set(s.turns.map((t) => t.id)).size !== s.turns.length
  )
    throw Error("Invalid Word Chat backup.");
  return s;
}

const active = new Map<string, Promise<number>>();
export async function backupWordChats(
  db: WordChatStore,
  config: BackupConfig,
  libraryId: string,
) {
  const destination = backupTarget(config);
  const lock = JSON.stringify([destination, libraryId]);
  const already = active.get(lock);
  const run = async () => {
    const words = await db.pending(libraryId, destination);
    if (!words.length) return 0;
    for (const path of ["word-chat/", "word-chat/v1/", folder(libraryId)]) {
      const response = await request(config, path, { method: "MKCOL" });
      if (!response.ok && response.status !== 405) await read(response);
      await response.body?.cancel();
    }
    let count = 0;
    let failure: unknown;
    for (const wordId of words) {
      try {
        await upload(db, config, { libraryId, wordId }, destination);
        count++;
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return count;
  };
  const task: Promise<number> = (
    already ? already.catch(() => 0).then(run) : run()
  ).finally(() => {
    if (active.get(lock) === task) active.delete(lock);
  });
  active.set(lock, task);
  return task;
}

async function upload(
  db: WordChatStore,
  config: BackupConfig,
  key: ChatKey,
  destination: string,
) {
  const { snapshot, etag } = await db.snapshot(key, destination);
  const body = JSON.stringify(snapshot);
  if (Buffer.byteLength(body) > CHAT_BACKUP_MAX)
    throw Error("This chat is too large for a single backup.");
  const path = folder(key.libraryId) + wordChatBackupName(key.wordId);
  const response = await request(config, path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
    },
    body,
  });
  let version = strong(response.headers.get("etag"));
  await response.body?.cancel();
  if (response.status === 412 || (response.ok && !version)) {
    const check = await request(config, path);
    version = strong(check.headers.get("etag"));
    if ((await read(check)) !== body)
      throw Error(
        "Remote Word Chat changed. Local history was kept and the remote copy was not overwritten.",
      );
  } else if (!response.ok) {
    throw Error(`Word Chat upload failed (HTTP ${response.status}).`);
  }
  if (!version)
    throw Error(
      "WebDAV did not supply a strong ETag. Word Chat backup cannot be safely updated.",
    );
  await db.mark(snapshot, destination, version);
}

const isChatFile = (name: string) => /^[a-f0-9]{64}\.json$/.test(name);

export async function listRemoteWordChats(
  config: BackupConfig,
  libraryId: string,
) {
  const path = folder(libraryId);
  const listing = await request(config, path, {
    method: "PROPFIND",
    headers: { Depth: "1", "Content-Type": "application/xml" },
    body: '<propfind xmlns="DAV:"><prop><getcontentlength/><getlastmodified/></prop></propfind>',
  });
  if (listing.status !== 207) {
    await listing.body?.cancel();
    if (listing.status === 404) return [];
    throw Error(`Cannot list remote Word Chats (HTTP ${listing.status}).`);
  }
  const entries = parseRemoteFiles(await read(listing), target(config) + path);
  return [
    ...new Map(
      entries
        .filter(({ name }) => isChatFile(name))
        .map((entry) => [entry.name, entry]),
    ).values(),
  ].sort((a, b) => {
    const timestamp = (modified?: string) => {
      const value = Date.parse(modified ?? "");
      return Number.isFinite(value) ? value : -Infinity;
    };
    return (
      timestamp(b.modified) - timestamp(a.modified) ||
      a.name.localeCompare(b.name)
    );
  });
}

async function fetchRemoteWordChat(
  config: BackupConfig,
  libraryId: string,
  name: string,
) {
  if (!isChatFile(name)) throw Error("Invalid Word Chat backup filename.");
  const response = await request(config, folder(libraryId) + name);
  const etag = strong(response.headers.get("etag"));
  return {
    snapshot: decodeChatSnapshot(await read(response), libraryId, name),
    etag,
  };
}

export async function readRemoteWordChat(
  config: BackupConfig,
  libraryId: string,
  name: string,
) {
  return (await fetchRemoteWordChat(config, libraryId, name)).snapshot;
}

export async function restoreWordChats(
  db: WordChatStore,
  config: BackupConfig,
  libraryId: string,
) {
  const entries = await listRemoteWordChats(config, libraryId);
  const result = { restored: 0, skipped: 0, failed: 0 };
  for (const { name } of entries) {
    try {
      const { snapshot, etag } = await fetchRemoteWordChat(
        config,
        libraryId,
        name,
      );
      if (!etag) throw Error("WebDAV did not supply a strong ETag.");
      if (await db.exists(snapshot)) result.skipped++;
      else {
        await db.restore(snapshot, backupTarget(config), etag);
        result.restored++;
      }
    } catch {
      result.failed++;
    }
  }
  return result;
}
