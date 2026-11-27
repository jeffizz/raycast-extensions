import { spawn } from "node:child_process";
import { reorderedGroupName } from "./group-order";
import { limitDailyQueue } from "./daily-limits";
import { recordAnswer, type Question } from "./learning";
import type { Grade } from "ts-fsrs";
import {
  mkdir,
  chmod,
  writeFile,
  readFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyLibrary, Library, validateLibrary, now, Word } from "./model";

export const sql = (s: string) =>
  `CAST(X'${Buffer.from(s, "utf8").toString("hex")}' AS TEXT)`;
export function sqlite(
  path: string,
  query: string,
  readonly = false,
  outputMode: "json" | "list" = "json",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "/usr/bin/sqlite3",
      [
        ...(readonly ? ["-readonly"] : []),
        "-batch",
        "-bail",
        `-${outputMode}`,
        path,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output: Buffer[] = [],
      errors: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      p.kill();
      reject(Error("SQLite operation timed out."));
    }, 60000);
    p.stdout.on("data", (b) => {
      size += b.length;
      if (size > 256 * 1024 * 1024) {
        p.kill();
        reject(Error("Database result is too large."));
      }
      output.push(Buffer.from(b));
    });
    p.stderr.on("data", (b) => errors.push(Buffer.from(b)));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.stdin.on("error", () => {});
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output).toString("utf8").trim());
      else
        reject(
          Error(
            `SQLite: ${Buffer.concat(errors).toString("utf8").trim() || "operation failed"}`,
          ),
        );
    });
    p.stdin.end(`.timeout 10000\nPRAGMA foreign_keys=ON;\n${query}\n`);
  });
}
export async function readSQLiteBackup(data: Buffer): Promise<Library> {
  if (data.subarray(0, 16).toString() !== "SQLite format 3\0")
    throw Error("Not a SQLite backup.");
  const root = await mkdtemp(join(tmpdir(), "fv-restore-"));
  try {
    const path = join(root, "vocabulary.sqlite");
    await writeFile(path, data, { mode: 0o600 });
    const integrity = JSON.parse(
      await sqlite(
        path,
        "PRAGMA trusted_schema=OFF; PRAGMA quick_check;",
        true,
      ),
    );
    if (integrity.length !== 1 || integrity[0].quick_check !== "ok")
      throw Error("SQLite backup integrity check failed.");
    const tables = JSON.parse(
      await sqlite(
        path,
        "SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%';",
        true,
      ),
    );
    if (
      tables.some((t: { type: string }) => !["table", "index"].includes(t.type))
    )
      throw Error("Unexpected views or triggers in SQLite backup.");
    const ver = JSON.parse(await sqlite(path, "PRAGMA user_version;", true))[0]
      ?.user_version;
    if (ver !== 1) throw Error("Unsupported SQLite backup version.");
    const reader = new Store(root);
    reader.ready = Promise.resolve();
    const lib = await reader.load();
    validateLibrary(lib);
    return lib;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const schema = `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS words(id TEXT PRIMARY KEY,word TEXT NOT NULL,archived INTEGER NOT NULL,practice INTEGER NOT NULL,familiarity TEXT NOT NULL,updated_at TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS words_lookup ON words(word);
CREATE TABLE IF NOT EXISTS groups_data(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,word_id TEXT NOT NULL REFERENCES words(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,word_id TEXT NOT NULL REFERENCES words(id),at TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_word ON reviews(word_id,at);
PRAGMA user_version=1;`;
export class Store {
  path: string;
  /** Internal initialization latch; set for isolated read-only backup validation. */
  ready?: Promise<void>;
  constructor(public root: string) {
    this.path = join(root, "vocabulary.sqlite");
  }
  async init() {
    if (!this.ready)
      this.ready = (async () => {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const ver = Number(
          await sqlite(this.path, "PRAGMA user_version;").then(
            (s) => JSON.parse(s || "[]")[0]?.user_version ?? 0,
          ),
        );
        if (ver > 1)
          throw Error(
            "This database was created by a newer plugin. Update before opening it.",
          );
        await sqlite(this.path, schema);
        await chmod(this.path, 0o600);
        await sqlite(
          this.path,
          `INSERT OR IGNORE INTO meta VALUES('header',${sql(JSON.stringify({ ...emptyLibrary(), words: undefined, groups: undefined, cards: undefined, reviews: undefined }))});`,
        );
      })();
    return this.ready;
  }
  async load(includeHistory = true, reviewsSince?: string): Promise<Library> {
    await this.init();
    const raw = await sqlite(
      this.path,
      `PRAGMA trusted_schema=OFF; BEGIN;
      SELECT 'header' AS kind,value AS data FROM meta WHERE key='header'
      UNION ALL SELECT 'words',data FROM (SELECT data FROM words ORDER BY rowid)
      UNION ALL SELECT 'groups',data FROM groups_data
      ${includeHistory ? `UNION ALL SELECT 'cards',data FROM cards UNION ALL SELECT 'reviews',data FROM reviews ${reviewsSince ? `WHERE at >= ${sql(reviewsSince)}` : ""}` : ""}; COMMIT;`,
      true,
    );
    // Plain text rows avoid costly nested JSON aggregation inside the sqlite CLI.
    const rows: { kind: string; data: string }[] = JSON.parse(raw || "[]");
    const header = rows.find((r) => r.kind === "header");
    if (!header) throw Error("Missing library header.");
    const lib: Library = {
      ...JSON.parse(header.data),
      words: [],
      groups: [],
      cards: [],
      reviews: [],
    };
    for (const row of rows)
      if (row.kind !== "header")
        lib[row.kind as "words"].push(JSON.parse(row.data));
    return lib;
  }
  async save(
    next: Library,
    expected: number,
    expectedId: string,
    replace = false,
    baseline?: Library,
  ) {
    await this.init();
    validateLibrary(next);
    next.revision = replace ? next.revision + 1 : expected + 1;
    const header = {
      version: 1,
      libraryId: next.libraryId,
      revision: next.revision,
      settings: next.settings,
    };
    const statements = [
      "BEGIN IMMEDIATE;",
      "CREATE TEMP TABLE revision_guard(ok INTEGER CHECK(ok=1));",
      `INSERT INTO revision_guard VALUES((SELECT CASE WHEN json_extract(value,'$.revision')=${expected} AND json_extract(value,'$.libraryId')=${sql(expectedId)} THEN 1 ELSE 0 END FROM meta WHERE key='header'));`,
    ];
    // Only update changed JSON rows. Snapshot-replace is used solely by explicit restore.
    if (replace)
      statements.push(
        "DELETE FROM reviews;DELETE FROM cards;DELETE FROM groups_data;DELETE FROM words;",
      );
    const originalWords = new Map(
      baseline?.words.map((w) => [w.id, JSON.stringify(w)]),
    );
    const originalGroups = new Map(
      baseline?.groups.map((g) => [g.id, JSON.stringify(g)]),
    );
    const originalCards = new Map(
      baseline?.cards.map((c) => [c.id, JSON.stringify(c)]),
    );
    const originalReviews = new Set(baseline?.reviews.map((r) => r.id));
    for (const w of next.words) {
      const serialized = JSON.stringify(w);
      if (!replace && originalWords.get(w.id) === serialized) continue;
      const data = sql(serialized);
      statements.push(
        `INSERT INTO words VALUES(${sql(w.id)},${sql(w.word)},${+w.archived},${+w.practice},${sql(w.familiarity)},${sql(w.updatedAt)},${data}) ON CONFLICT(id) DO UPDATE SET word=excluded.word,archived=excluded.archived,practice=excluded.practice,familiarity=excluded.familiarity,updated_at=excluded.updated_at,data=excluded.data WHERE words.data<>excluded.data;`,
      );
    }
    for (const g of next.groups)
      if (replace || originalGroups.get(g.id) !== JSON.stringify(g))
        statements.push(
          `INSERT INTO groups_data VALUES(${sql(g.id)},${sql(JSON.stringify(g))}) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE groups_data.data<>excluded.data;`,
        );
    for (const c of next.cards)
      if (replace || originalCards.get(c.id) !== JSON.stringify(c))
        statements.push(
          `INSERT INTO cards VALUES(${sql(c.id)},${sql(c.wordId)},${sql(JSON.stringify(c))}) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE cards.data<>excluded.data;`,
        );
    for (const r of next.reviews)
      if (replace || !originalReviews.has(r.id))
        statements.push(
          `INSERT OR IGNORE INTO reviews VALUES(${sql(r.id)},${sql(r.wordId)},${sql(r.at)},${sql(JSON.stringify(r))});`,
        );
    // Groups can be deleted; vocabulary is archived, not destructively removed.
    statements.push(
      next.groups.length
        ? `DELETE FROM groups_data WHERE id NOT IN (${next.groups.map((g) => sql(g.id)).join(",")});`
        : "DELETE FROM groups_data;",
    );
    statements.push(
      `UPDATE meta SET value=${sql(JSON.stringify(header))} WHERE key='header';COMMIT;`,
    );
    try {
      await sqlite(this.path, statements.join("\n"));
    } catch (e) {
      if (String(e).includes("CHECK constraint"))
        throw Error(
          "Library changed in another command. Refresh and try again; nothing was overwritten.",
        );
      throw e;
    }
  }
  async mutate<T>(change: (lib: Library) => T | Promise<T>): Promise<T> {
    const lib = await this.load();
    const rev = lib.revision,
      id = lib.libraryId;
    const baseline = structuredClone(lib);
    const result = await change(lib);
    await this.save(lib, rev, id, false, baseline);
    return result;
  }
  async reorderGroup(
    libraryId: string,
    groupId: string,
    before: string[],
    after: string[],
  ) {
    if (
      new Set(after).size !== after.length ||
      before.length !== after.length ||
      before.some((id) => !after.includes(id))
    )
      throw Error("Group order must preserve all members.");
    await this.init();
    const raw = await sqlite(
      this.path,
      `SELECT data FROM groups_data WHERE id=${sql(groupId)};`,
      true,
      "list",
    );
    if (!raw) throw Error("Group changed. Refresh and retry.");
    const group = JSON.parse(raw) as Library["groups"][number];
    const rows: { id: string; word: string }[] = JSON.parse(
      (await sqlite(
        this.path,
        `SELECT id,word FROM words WHERE id IN (SELECT value FROM json_each(${sql(JSON.stringify(before))}));`,
        true,
      )) || "[]",
    );
    const name = reorderedGroupName(
      group.name,
      before,
      after,
      new Map(rows.map((w) => [w.id, w.word])),
    );
    try {
      await sqlite(
        this.path,
        `BEGIN IMMEDIATE;
        UPDATE groups_data SET data=json_set(data,'$.wordIds',json(${sql(JSON.stringify(after))}),'$.name',${sql(name)},'$.updatedAt',${sql(now())})
        WHERE id=${sql(groupId)} AND data=${sql(raw)} AND json_extract(data,'$.wordIds')=json(${sql(JSON.stringify(before))})
        AND EXISTS(SELECT 1 FROM meta WHERE key='header' AND json_extract(value,'$.libraryId')=${sql(libraryId)});
        CREATE TEMP TABLE group_guard(ok INTEGER CHECK(ok=1)); INSERT INTO group_guard VALUES(changes());
        UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1) WHERE key='header';
        COMMIT;`,
      );
    } catch (error) {
      if (String(error).includes("CHECK constraint"))
        throw Error("Group changed. Refresh and retry.");
      throw error;
    }
  }
  async mutateContent<T>(
    expectedLibraryId: string,
    change: (lib: Library) => T,
  ): Promise<T> {
    const lib = await this.load(false);
    if (lib.libraryId !== expectedLibraryId)
      throw Error("Library changed. Reopen AI preview.");
    const baseline = structuredClone(lib);
    const result = change(lib);
    await this.save(
      lib,
      baseline.revision,
      baseline.libraryId,
      false,
      baseline,
    );
    return result;
  }
  async updateSettings(
    expectedLibraryId: string,
    change: (lib: Library) => void,
  ) {
    const header =
      await this.getMeta<
        Pick<Library, "version" | "libraryId" | "revision" | "settings">
      >("header");
    if (!header || header.libraryId !== expectedLibraryId)
      throw Error("Library changed. Reopen settings.");
    // Settings validation requires no vocabulary, cards, or review history.
    const candidate: Library = {
      ...header,
      words: [],
      groups: [],
      cards: [],
      reviews: [],
    };
    change(candidate);
    validateLibrary(candidate);
    await sqlite(
      this.path,
      `BEGIN IMMEDIATE;
      CREATE TEMP TABLE settings_guard(ok INTEGER CHECK(ok=1));
      UPDATE meta SET value=json_set(value,'$.settings',json(${sql(JSON.stringify(candidate.settings ?? {}))}),'$.revision',json_extract(value,'$.revision')+1)
      WHERE key='header' AND json_extract(value,'$.libraryId')=${sql(header.libraryId)} AND json_extract(value,'$.revision')=${header.revision};
      INSERT INTO settings_guard VALUES(changes());
      COMMIT;`,
    );
  }
  async updateWord(id: string, edit: (w: Word) => void | Promise<void>) {
    await this.init();
    const rows = JSON.parse(
      (await sqlite(
        this.path,
        `SELECT data FROM words WHERE id=${sql(id)};`,
        true,
      )) || "[]",
    );
    if (!rows.length) throw Error("Word no longer exists.");
    const before = rows[0].data as string;
    const word: Word = JSON.parse(before);
    await edit(word);
    word.updatedAt = now();
    const candidate = emptyLibrary();
    candidate.words = [word];
    validateLibrary(candidate);
    const data = sql(JSON.stringify(word));
    try {
      await sqlite(
        this.path,
        `BEGIN IMMEDIATE;
      UPDATE words SET word=${sql(word.word)},archived=${+word.archived},practice=${+word.practice},familiarity=${sql(word.familiarity)},updated_at=${sql(word.updatedAt)},data=CASE WHEN json_extract(data,'$.lastViewedAt') IS NULL THEN ${data} ELSE json_set(${data},'$.lastViewedAt',json_extract(data,'$.lastViewedAt')) END WHERE id=${sql(id)} AND json_remove(data,'$.lastViewedAt')=json_remove(${sql(before)},'$.lastViewedAt');
      CREATE TEMP TABLE edit_guard(ok INTEGER CHECK(ok=1));INSERT INTO edit_guard VALUES(changes());
      UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1) WHERE key='header';COMMIT;`,
      );
    } catch (e) {
      if (String(e).includes("CHECK constraint"))
        throw Error("Word changed in another command. Refresh and retry.");
      throw e;
    }
  }
  async savePracticeAnswer(
    libraryId: string,
    question: Question,
    options: {
      rating: Grade;
      answer: string;
      correct: boolean;
      extraPractice?: boolean;
      updateMeaningFamiliarity?: boolean;
    },
  ): Promise<Word> {
    await this.init();
    const wordId = sql(question.word.id);
    const cardId = sql(question.id);
    const snapshot = JSON.parse(
      (await sqlite(
        this.path,
        `SELECT value AS header,
          (SELECT data FROM words WHERE id=${wordId}) AS word,
          (SELECT data FROM cards WHERE id=${cardId}) AS card
        FROM meta WHERE key='header';`,
        true,
      )) || "[]",
    )[0];
    const lib: Library = {
      ...JSON.parse(snapshot.header),
      words: snapshot.word ? [JSON.parse(snapshot.word)] : [],
      groups: [],
      cards: snapshot.card ? [JSON.parse(snapshot.card)] : [],
      reviews: [],
    };
    if (lib.libraryId !== libraryId)
      throw Error("Library changed. Reopen practice.");
    const mode = question.mode;
    if (!options.extraPractice && mode !== "copy") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const startAt = sql(start.toISOString());
      const endAt = sql(end.toISOString());
      const sense =
        mode === "gender"
          ? "COALESCE(json_extract(data,'$.senseId'),'undefined')"
          : "''";
      // Only today's distinct cards leave SQLite; historical rows classify them in place.
      const rows: { id: string; fresh: number }[] = JSON.parse(
        (await sqlite(
          this.path,
          `WITH today AS (
            SELECT DISTINCT word_id, ${sense} AS sense FROM reviews
            WHERE at >= ${startAt} AND at < ${endAt} AND json_extract(data,'$.mode')=${sql(mode)}
          )
          SELECT word_id || ${sql(":" + mode)}${mode === "gender" ? " || ':' || sense" : ""} AS id,
            NOT EXISTS (
              SELECT 1 FROM reviews
              WHERE reviews.word_id=today.word_id AND at < ${startAt}
              AND json_extract(data,'$.mode')=${sql(mode)} AND ${sense}=today.sense
            ) AS fresh
          FROM today;`,
          true,
        )) || "[]",
      );
      const settings = lib.settings?.practice?.[mode];
      const usage = {
        newToday: new Set<string>(),
        reviews: new Set<string>(),
        newLimit: settings?.dailyNew ?? 10,
        reviewLimit: settings?.dailyReview ?? Infinity,
      };
      for (const row of rows)
        (row.fresh ? usage.newToday : usage.reviews).add(row.id);
      if (!limitDailyQueue(lib, mode, [question], start, usage).length)
        throw Error(
          "Daily limit reached. Progress is preserved. Continue tomorrow, increase Daily Limits, or start All Included Words (Extra Practice).",
        );
    }
    const word = recordAnswer(
      lib,
      question,
      options.rating,
      options.answer,
      options.correct,
      options.updateMeaningFamiliarity,
    );
    const [review] = lib.reviews;
    const [card] = mode === "copy" ? [] : lib.cards;
    try {
      await sqlite(
        this.path,
        `BEGIN IMMEDIATE;
        CREATE TEMP TABLE answer_guard(ok INTEGER CHECK(ok=1));
        UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1)
        WHERE key='header' AND json_extract(value,'$.libraryId')=${sql(libraryId)} AND json_extract(value,'$.revision')=${lib.revision};
        INSERT INTO answer_guard VALUES(changes());
        UPDATE words SET updated_at=${sql(word.updatedAt)},familiarity=${sql(word.familiarity)},data=${sql(JSON.stringify(word))}
        WHERE id=${wordId};
        ${card ? `INSERT INTO cards VALUES(${cardId},${wordId},${sql(JSON.stringify(card))}) ON CONFLICT(id) DO UPDATE SET data=excluded.data;` : ""}
        INSERT INTO reviews VALUES(${sql(review.id)},${wordId},${sql(review.at)},${sql(JSON.stringify(review))});
        COMMIT;`,
      );
    } catch (error) {
      if (String(error).includes("CHECK constraint"))
        throw Error(
          "Library changed in another command. Refresh and try again; nothing was overwritten.",
        );
      throw error;
    }
    return word;
  }
  async getPracticeCard(
    id: string,
  ): Promise<Library["cards"][number] | undefined> {
    await this.init();
    const raw = await sqlite(
      this.path,
      `SELECT data FROM cards WHERE id=${sql(id)};`,
      true,
      "list",
    );
    return raw ? JSON.parse(raw) : undefined;
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    await this.init();
    // Metadata is already JSON. Avoid re-encoding a large JSON string in CLI JSON mode.
    const raw = await sqlite(
      this.path,
      `SELECT value FROM meta WHERE key=${sql(key)};`,
      true,
      "list",
    );
    return raw ? JSON.parse(raw) : undefined;
  }
  async setMeta(key: string, value: unknown) {
    await this.init();
    await sqlite(
      this.path,
      `INSERT INTO meta VALUES(${sql(key)},${sql(JSON.stringify(value))}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    );
  }
  async setMetas(values: Record<string, unknown>) {
    await this.init();
    await sqlite(
      this.path,
      `BEGIN IMMEDIATE;\n${Object.entries(values)
        .map(
          ([key, value]) =>
            `INSERT INTO meta VALUES(${sql(key)},${sql(JSON.stringify(value))}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
        )
        .join("\n")}\nCOMMIT;`,
    );
  }
  async touchWord(id: string) {
    await this.init();
    const at = now();
    // A view is activity, not an edit: don't invalidate an open word editor.
    await sqlite(
      this.path,
      `BEGIN IMMEDIATE; UPDATE words SET data=json_set(data,'$.lastViewedAt',${sql(at)}) WHERE id=${sql(id)}; UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1) WHERE key='header' AND changes()>0; COMMIT;`,
    );
  }
  async exportSQLite(path: string) {
    await this.init();
    await sqlite(this.path, `VACUUM INTO ${sql(path)};`);
    await chmod(path, 0o600);
    // Backup status belongs to this computer, not to the portable library.
    await sqlite(
      path,
      "DELETE FROM meta WHERE key <> 'header'; PRAGMA journal_mode=DELETE; VACUUM;",
    );
    return path;
  }
  async resetLibrary(expected?: { revision: number; libraryId: string }) {
    await this.backupLocal("before-reset");
    await this.init();
    await sqlite(
      this.path,
      `BEGIN IMMEDIATE;
      ${expected ? `CREATE TEMP TABLE reset_guard(ok INTEGER CHECK(ok=1)); INSERT INTO reset_guard VALUES((SELECT CASE WHEN json_extract(value,'$.revision')=${expected.revision} AND json_extract(value,'$.libraryId')=${sql(expected.libraryId)} THEN 1 ELSE 0 END FROM meta WHERE key='header'));` : ""}
      DELETE FROM reviews; DELETE FROM cards; DELETE FROM groups_data; DELETE FROM words;
      UPDATE meta SET value=json_set(value,'$.revision',json_extract(value,'$.revision')+1,'$.settings',json('{}')) WHERE key='header';
      COMMIT;`,
    );
  }
  async backupLocal(label = "manual") {
    const lib = await this.load();
    const dir = join(this.root, "backups");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(
      dir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`,
    );
    await writeFile(path, JSON.stringify(lib), { mode: 0o600 });
    return path;
  }
  async restoreFile(path: string) {
    const lib = JSON.parse(await readFile(path, "utf8"));
    validateLibrary(lib);
    await this.backupLocal("before-restore");
    const current = await this.load();
    await this.save(lib, current.revision, current.libraryId, true);
    return lib;
  }
}
