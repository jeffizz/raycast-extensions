import { chmod, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { sql, sqlite } from "./sqlite";
import {
  MAX_CHAT_HISTORY_WINDOW,
  type ChatTurn,
} from "../ai/word-chat-context";

export type ChatKey = { libraryId: string; wordId: string };
export type ChatSnapshot = ChatKey & {
  version: 1;
  revision: string;
  turns: ChatTurn[];
};
export const CHAT_BACKUP_MAX = 4 * 1024 * 1024;

const key = ({ libraryId, wordId }: ChatKey) =>
  `library=${sql(libraryId)} AND word=${sql(wordId)}`;
const scope = ({ libraryId, wordId }: ChatKey) =>
  `${sql(libraryId)},${sql(wordId)}`;
const touch = (
  k: ChatKey,
) => `INSERT INTO chats(library, word, revision) VALUES(${scope(k)},${sql(randomUUID())})
ON CONFLICT(library,word) DO UPDATE SET revision=excluded.revision;`;

export class WordChatStore {
  private ready?: Promise<void>;
  private readonly path: string;

  constructor(private readonly root: string) {
    this.path = join(root, "word-chat.sqlite");
  }

  private async query(query: string) {
    this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await (await open(this.path, "a", 0o600)).close();
      await sqlite(
        this.path,
        `PRAGMA secure_delete=ON;
        CREATE TABLE IF NOT EXISTS chats(library TEXT, word TEXT, revision TEXT NOT NULL, PRIMARY KEY(library,word));
        CREATE TABLE IF NOT EXISTS turns(seq INTEGER PRIMARY KEY AUTOINCREMENT, library TEXT NOT NULL, word TEXT NOT NULL, id TEXT UNIQUE NOT NULL, question TEXT NOT NULL, answer TEXT, sense TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS turns_by_word ON turns(library,word,seq);
        CREATE TABLE IF NOT EXISTS chat_locks(library TEXT, word TEXT, owner TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(library,word));
        CREATE TABLE IF NOT EXISTS backups(library TEXT, word TEXT, target TEXT, revision TEXT, etag TEXT, PRIMARY KEY(library,word,target));`,
      );
      await chmod(this.path, 0o600);
    })();
    await this.ready;
    return sqlite(this.path, query);
  }

  async acquire(k: ChatKey) {
    const owner = randomUUID();
    const now = Date.now();
    const result = await this
      .query(`INSERT INTO chat_locks VALUES(${scope(k)},${sql(owner)},${now + 300000})
      ON CONFLICT(library,word) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE chat_locks.expires <= ${now}
      RETURNING owner;`);
    if (!result) throw Error("Another operation is in progress for this word.");
    return async () => {
      await this.query(
        `DELETE FROM chat_locks WHERE ${key(k)} AND owner=${sql(owner)};`,
      );
    };
  }

  async page(k: ChatKey, before?: number, completeOnly = false) {
    return JSON.parse(
      (await this
        .query(`SELECT seq,id,question,answer,sense FROM turns WHERE ${key(k)}
      ${before === undefined ? "" : `AND seq < ${Math.trunc(before)}`}
      ${completeOnly ? "AND answer IS NOT NULL" : ""}
      ORDER BY seq DESC LIMIT ${completeOnly ? MAX_CHAT_HISTORY_WINDOW : 20};`)) ||
        "[]",
    ) as (ChatTurn & { seq: number })[];
  }

  async start(k: ChatKey, question: string, sense: string) {
    const id = randomUUID();
    await this.query(`BEGIN IMMEDIATE;
      INSERT INTO turns(library,word,id,question,sense) VALUES(${scope(k)},${sql(id)},${sql(question)},${sql(sense)});
      ${touch(k)} COMMIT;`);
    return id;
  }

  async isUnanswered(k: ChatKey, id: string) {
    return Boolean(
      await this.query(
        `SELECT 1 FROM turns WHERE ${key(k)} AND id=${sql(id)} AND answer IS NULL;`,
      ),
    );
  }

  async finish(k: ChatKey, id: string, answer: string) {
    await this.query(`BEGIN IMMEDIATE;
      UPDATE turns SET answer=${sql(answer)} WHERE ${key(k)} AND id=${sql(id)} AND answer IS NULL;
      CREATE TEMP TABLE chat_guard(ok INTEGER CHECK(ok=1)); INSERT INTO chat_guard VALUES(changes());
      ${touch(k)} COMMIT;`);
  }

  async clear(k: ChatKey) {
    await this.query(`PRAGMA secure_delete=ON; BEGIN IMMEDIATE;
      DELETE FROM turns WHERE ${key(k)}; ${touch(k)} COMMIT;`);
  }

  async pending(libraryId: string, target: string): Promise<string[]> {
    const rows = JSON.parse(
      (await this.query(`SELECT c.word FROM chats c LEFT JOIN backups b
      ON c.library=b.library AND c.word=b.word AND b.target=${sql(target)}
      WHERE c.library=${sql(libraryId)} AND b.revision IS NOT c.revision;`)) ||
        "[]",
    ) as { word: string }[];
    return rows.map((row) => row.word);
  }

  async snapshot(k: ChatKey, target: string) {
    const [row] = JSON.parse(
      (await this.query(`SELECT revision,
      (SELECT etag FROM backups WHERE ${key(k)} AND target=${sql(target)}) AS etag,
      CASE WHEN (SELECT total(length(CAST(json_object('id',id,'question',question,'answer',answer,'sense',sense) AS BLOB))+1) FROM turns WHERE ${key(k)}) <= ${CHAT_BACKUP_MAX}
      THEN (SELECT json_group_array(json_object('id',id,'question',question,'answer',answer,'sense',sense))
        FROM (SELECT * FROM turns WHERE ${key(k)} ORDER BY seq)) END AS turns
      FROM chats WHERE ${key(k)};`)) || "[]",
    ) as { revision: string; etag: string | null; turns: string | null }[];
    if (!row) throw Error("Chat does not exist.");
    if (row.turns === null)
      throw Error(
        "This chat is too large for a single backup. Local history is unchanged.",
      );
    const snapshot: ChatSnapshot = {
      ...k,
      version: 1,
      revision: row.revision,
      turns: JSON.parse(row.turns),
    };
    return { snapshot, etag: row.etag };
  }

  async mark(snapshot: ChatSnapshot, target: string, etag: string) {
    await this
      .query(`INSERT INTO backups VALUES(${scope(snapshot)},${sql(target)},${sql(snapshot.revision)},${sql(etag)})
      ON CONFLICT(library,word,target) DO UPDATE SET revision=excluded.revision, etag=excluded.etag;`);
  }

  async restore(snapshot: ChatSnapshot, target: string, etag: string) {
    await this.query(`BEGIN IMMEDIATE;
      CREATE TEMP TABLE restore_guard(ok INTEGER CHECK(ok=1));
      INSERT INTO restore_guard VALUES(NOT EXISTS(SELECT 1 FROM chats WHERE ${key(snapshot)}));
      INSERT INTO chats VALUES(${scope(snapshot)},${sql(snapshot.revision)});
      ${snapshot.turns.map((t) => `INSERT INTO turns(library,word,id,question,answer,sense) VALUES(${scope(snapshot)},${sql(t.id)},${sql(t.question)},${t.answer === null ? "NULL" : sql(t.answer)},${sql(t.sense)});`).join("\n")}
      INSERT INTO backups VALUES(${scope(snapshot)},${sql(target)},${sql(snapshot.revision)},${sql(etag)});
      COMMIT;`);
  }

  async exists(k: ChatKey) {
    return Boolean(await this.query(`SELECT 1 FROM chats WHERE ${key(k)};`));
  }
}
