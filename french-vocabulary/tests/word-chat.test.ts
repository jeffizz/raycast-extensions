import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chatContext,
  normalizeChatHistoryWindow,
  type ChatTurn,
} from "../src/ai/word-chat-context";
import { candidateSense, parseCandidates } from "../src/ai/core";
import { parseCodexEvents } from "../src/ai/codex-cli";
import { newWord } from "../src/core/model";
import { WordChatStore } from "../src/core/word-chat";
import {
  backupWordChats,
  listRemoteWordChats,
  readRemoteWordChat,
  wordChatBackupName,
  restoreWordChats,
} from "../src/core/word-chat-backup";

const key = { libraryId: "library", wordId: "word" };

test("context uses a bounded suffix of complete replies and excludes unrelated vocabulary data", () => {
  const word = newWord(
    "ami",
    candidateSense({ pos: "n.m.", ipa: "a.mi", zh: "朋友", en: "friend" }),
  );
  word.notes = "private note";
  const turns: ChatTurn[] = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    question: "Q" + i,
    answer: i === 5 ? null : "A" + i,
    sense: "",
  }));
  const visible = chatContext(word, word.senses[0].id, "Why?", turns);
  assert.deepEqual(
    visible.history.map((t) => t.id),
    ["3", "4", "6"],
  );
  assert.deepEqual(
    JSON.parse(visible.input).history.map((t: ChatTurn) => t.question),
    ["Q3", "Q4", "Q6"],
  );
  assert.doesNotMatch(visible.input, /private note/);
  const noHistory = chatContext(word, undefined, "Why?", turns, undefined, 0);
  assert.deepEqual(JSON.parse(noHistory.input).history, []);
  assert.equal(JSON.parse(noHistory.input).question, "Why?");
  const expanded = chatContext(word, undefined, "Why?", turns, undefined, 9);
  assert.deepEqual(
    expanded.history.map((turn) => turn.id),
    ["0", "1", "2", "3", "4", "6"],
  );
  const bounded = chatContext(
    word,
    undefined,
    "Why?",
    turns.map((t) => ({ ...t, answer: t.answer && "é".repeat(2800) })),
    undefined,
    9,
  );
  assert.ok(Buffer.byteLength(bounded.input) <= 12000);
  assert.deepEqual(
    bounded.history.map((t) => t.id),
    ["4", "6"],
  );
});

test("older history preferences round down without increasing context", () => {
  assert.deepEqual(
    [undefined, 0, 1, 2, 4, 5, 8, 12].map(normalizeChatHistoryWindow),
    [3, 0, 1, 1, 3, 5, 7, 9],
  );
});

test("chat validates one Markdown answer in both transports", () => {
  const raw = JSON.stringify({ items: [{ text: "**Ami** means friend." }] });
  assert.deepEqual(parseCandidates(raw, "chat"), [
    { text: "**Ami** means friend." },
  ]);
  assert.throws(() =>
    parseCandidates(
      JSON.stringify({ items: [{ text: "A" }, { text: "B" }] }),
      "chat",
    ),
  );
  const events = [
    { type: "item.completed", item: { type: "agent_message", text: raw } },
    { type: "turn.completed", usage: { input_tokens: 14 } },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
  assert.deepEqual(parseCodexEvents(events, "chat"), {
    items: [{ text: "**Ami** means friend." }],
    usage: { input_tokens: 14 },
  });
});

test("SQLite keeps unlimited per-word turns, pages history, and prevents late writes after clear", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fv-word-chat-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const db = new WordChatStore(root);
  const other = new WordChatStore(root);
  const release = await db.acquire(key);
  await assert.rejects(other.acquire(key), /in progress/);
  await release();
  await (
    await other.acquire(key)
  )();
  for (let i = 0; i < 24; i++) {
    const id = await db.start(key, "Question " + i, "noun");
    await db.finish(key, id, "Answer");
  }
  const id = await db.start(key, "Pending", "");
  await db.start({ ...key, libraryId: "other" }, "Separate library", "");
  const page = await other.page(key);
  assert.equal(page.length, 20);
  assert.equal(page[0].answer, null);
  assert.equal((await other.page(key, page.at(-1)?.seq)).length, 5);
  assert.equal(
    (await other.page(key, undefined, true))[0].question,
    "Question 23",
  );
  assert.equal((await other.page(key, undefined, true)).length, 9);
  await db.clear(key);
  await assert.rejects(other.finish(key, id, "Late reply"));
  assert.deepEqual(await other.page(key), []);
  assert.equal((await other.page({ ...key, libraryId: "other" })).length, 1);
  assert.deepEqual(
    (await other.snapshot(key, "destination")).snapshot.turns,
    [],
  );
});

test("WebDAV backs up changed chats and clear markers, restores missing chats, and avoids clobbering remote revisions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fv-chat-dav-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const db = new WordChatStore(join(root, "source"));
  const restored = new WordChatStore(join(root, "restored"));
  const third = new WordChatStore(join(root, "third"));
  const config = {
    url: "https://example.invalid/dav/",
    username: "test",
    password: "",
  };
  const files = new Map<string, { body: string; etag: string }>();
  let uploads = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init?: RequestInit) => {
      const entry = files.get(url);
      switch (init?.method) {
        case "MKCOL":
          return new Response(null, { status: 201 });
        case "PUT": {
          const headers = new Headers(init.headers);
          if (
            entry
              ? headers.get("If-Match") !== entry.etag
              : headers.get("If-None-Match") !== "*"
          )
            return new Response(null, { status: 412 });
          const etag = '"' + ++uploads + '"';
          files.set(url, { etag, body: String(init.body) });
          return new Response(null, { status: 201, headers: { etag } });
        }
        case "PROPFIND":
          return new Response(
            "<d:multistatus>" +
              [...files.keys()]
                .filter((name) => name.startsWith(url))
                .map(
                  (name) =>
                    `<d:response><d:href>${name}</d:href><d:propstat><d:prop><d:getcontentlength>${Buffer.byteLength(files.get(name)!.body)}</d:getcontentlength><d:getlastmodified>${name.endsWith(wordChatBackupName(key.wordId)) ? "Wed, 25 Nov 2026 12:00:00 GMT" : "Thu, 26 Nov 2026 12:00:00 GMT"}</d:getlastmodified></d:prop></d:propstat></d:response>`,
                )
                .join("") +
              "</d:multistatus>",
            { status: 207 },
          );
        default:
          return entry
            ? new Response(entry.body, { headers: { etag: entry.etag } })
            : new Response(null, { status: 404 });
      }
    },
  );
  const id = await db.start(key, "What is the register?", "noun");
  await db.finish(key, id, "Informal.");
  const next = { ...key, wordId: "another-word" };
  await db.start(next, "Other question", "");
  assert.equal(await backupWordChats(db, config, key.libraryId), 2);
  assert.equal(await backupWordChats(db, config, key.libraryId), 0);
  const listed = await listRemoteWordChats(config, key.libraryId);
  assert.deepEqual(
    listed.map((entry) => entry.name),
    [wordChatBackupName(next.wordId), wordChatBackupName(key.wordId)],
  );
  assert.ok(listed.every((entry) => (entry.size ?? 0) > 0));
  assert.deepEqual(await listRemoteWordChats(config, "different-library"), []);
  assert.equal(
    (
      await readRemoteWordChat(
        config,
        key.libraryId,
        wordChatBackupName(key.wordId),
      )
    ).turns[0].answer,
    "Informal.",
  );
  await assert.rejects(
    readRemoteWordChat(config, key.libraryId, "../latest.json"),
    /Invalid/,
  );
  assert.equal(uploads, 2);
  assert.deepEqual(await restoreWordChats(restored, config, key.libraryId), {
    restored: 2,
    skipped: 0,
    failed: 0,
  });
  assert.equal((await restored.page(key))[0].answer, "Informal.");
  assert.deepEqual(await restoreWordChats(restored, config, key.libraryId), {
    restored: 0,
    skipped: 2,
    failed: 0,
  });
  await db.clear(key);
  assert.equal(await backupWordChats(db, config, key.libraryId), 1);
  assert.equal(uploads, 3);
  assert.deepEqual(await restoreWordChats(third, config, key.libraryId), {
    restored: 2,
    skipped: 0,
    failed: 0,
  });
  assert.deepEqual(await third.page(key), []);
  await restored.start(key, "Would overwrite the clear marker", "");
  await assert.rejects(
    backupWordChats(restored, config, key.libraryId),
    /Remote Word Chat changed/,
  );
  assert.equal(uploads, 3);
});
