import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  archiveBeforeReset,
  downloadResetArchive,
  deleteResetArchive,
  parseRemoteFiles,
  backupRemote,
  downloadBackup,
  restoreRemote,
  target,
} from "../src/core/backup";
import { Store } from "../src/core/sqlite";
import { applyImport } from "../src/core/importer";

test("WebDAV end-to-end: verified snapshots, first-device guard, restore, subsequent backup, corruption", async () => {
  const files = new Map<string, Buffer>();
  const requests: string[] = [];
  let rejectIndex = false;
  let rejectDelete = false;
  const etag = (s: Buffer) =>
    `"${createHash("sha256").update(s).digest("hex")}"`;
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (
      req.headers.authorization !==
      `Basic ${Buffer.from("u:p").toString("base64")}`
    ) {
      res.writeHead(401);
      res.end();
      return;
    }
    const key = req.url!;
    if (req.method === "GET") {
      const body = files.get(key);
      if (body === undefined) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        ETag: etag(body),
        "Content-Type": "application/json",
      });
      res.end(body);
      return;
    }
    if (req.method === "DELETE") {
      if (rejectDelete) {
        res.writeHead(503);
        res.end();
        return;
      }
      files.delete(key);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "PUT") {
      if (rejectIndex && key.endsWith("latest.json")) {
        res.writeHead(412);
        res.end();
        return;
      }
      const old = files.get(key);
      if (
        (req.headers["if-none-match"] === "*" && old !== undefined) ||
        (req.headers["if-match"] &&
          (!old || req.headers["if-match"] !== etag(old)))
      ) {
        res.writeHead(412);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const b of req) chunks.push(Buffer.from(b));
      const body = Buffer.concat(chunks);
      files.set(key, body);
      res.writeHead(201, { ETag: etag(body) });
      res.end();
      return;
    }
    res.writeHead(405);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address() as { port: number };
  const cfg = {
    url: `http://127.0.0.1:${addr.port}/backup/`,
    username: "u",
    password: "p",
  };
  const root = await mkdtemp(join(tmpdir(), "fv-webdav-"));
  try {
    const a = new Store(join(root, "a"));
    await a.mutate((l) => {
      applyImport(
        l,
        [["demain", "adv.", "/də.mɛ̃/", "tomorrow", "明天"]],
        ["word", "pos", "ipa", "en", "zh"],
      );
    });
    const m1 = await backupRemote(a, cfg);
    assert.equal(m1.words, 1);
    assert.equal((await downloadBackup(cfg)).library.words[0].word, "demain");
    const before = requests.filter((x) => x.startsWith("PUT")).length;
    await a.setMeta("webdav", {
      ...(await a.getMeta<object>("webdav")),
      error: "Previous connection failure",
    });
    await backupRemote(a, cfg);
    assert.equal((await a.getMeta<any>("webdav")).error, undefined);
    assert.equal(requests.filter((x) => x.startsWith("PUT")).length, before);
    const b = new Store(join(root, "b"));
    await assert.rejects(
      backupRemote(b, cfg),
      /Remote backup is new or changed/,
    );
    assert.equal(
      files.get("/backup/latest.json")?.toString(),
      JSON.stringify(m1),
    );
    assert.equal(m1.format, 2);
    assert.equal(
      files.get(`/backup/${m1.file}`)?.subarray(0, 16).toString(),
      "SQLite format 3\0",
    );
    await restoreRemote(b, cfg, await downloadBackup(cfg));
    assert.equal((await b.load()).words[0].word, "demain");
    await b.updateWord((await b.load()).words[0].id, (w) => {
      w.notes = "restored and edited";
    });
    const m2 = await backupRemote(b, cfg);
    assert.notEqual(m1.file, m2.file);
    assert.ok(files.has(`/backup/${m1.file}`));
    assert.equal(
      (await downloadBackup(cfg)).library.words[0].notes,
      "restored and edited",
    );
    await assert.rejects(
      backupRemote(a, cfg),
      /Remote backup is new or changed/,
    );
    await b.updateWord((await b.load()).words[0].id, (w) => {
      w.notes = "increment one 中文";
    });
    const increment1 = await backupRemote(b, cfg, { kind: "incremental" });
    assert.equal(increment1.file, m2.file);
    assert.equal(increment1.increments?.length, 1);
    assert.equal(
      (await downloadBackup(cfg)).library.words[0].notes,
      "increment one 中文",
    );
    await b.touchWord((await b.load()).words[0].id);
    const increment2 = await backupRemote(b, cfg, { kind: "incremental" });
    assert.equal(increment2.increments?.length, 2);
    assert.deepEqual((await downloadBackup(cfg)).library, await b.load());
    const deltaFile = `/backup/${increment2.increments![1].file}`;
    const original = files.get(deltaFile)!;
    files.set(deltaFile, Buffer.from("bad"));
    await assert.rejects(downloadBackup(cfg), /checksum mismatch/);
    files.set(deltaFile, original);
    rejectIndex = true;
    await assert.rejects(
      backupRemote(b, cfg, { kind: "full", force: true }),
      /changed during upload/,
    );
    assert.ok(files.has(`/backup/${increment1.increments![0].file}`));
    assert.deepEqual((await downloadBackup(cfg)).library, await b.load());
    rejectIndex = false;
    rejectDelete = true;
    const full = await backupRemote(b, cfg, { kind: "full", force: true });
    assert.equal(full.increments?.length, 0);
    assert.ok((await b.getMeta<any>("webdav")).cleanupPending.length === 2);
    rejectDelete = false;
    const uploadsBeforeCleanup = requests.filter((request) =>
      request.startsWith("PUT"),
    ).length;
    const cleanupOnly = await backupRemote(b, cfg, { kind: "incremental" });
    assert.equal(cleanupOnly.file, full.file);
    assert.equal(
      requests.filter((request) => request.startsWith("PUT")).length,
      uploadsBeforeCleanup,
    );
    assert.equal((await b.getMeta<any>("webdav")).cleanupPending, undefined);
    for (const increment of increment2.increments!)
      assert.ok(!files.has(`/backup/${increment.file}`));
    const full2 = await backupRemote(b, cfg, { kind: "full", force: true });
    assert.notEqual(full2.file, full.file);
    for (const d of increment2.increments!)
      assert.ok(!files.has(`/backup/${d.file}`));
    assert.equal((await b.getMeta<any>("webdav")).cleanupPending, undefined);
    assert.ok(files.has(`/backup/${m2.file}`));
    assert.deepEqual((await downloadBackup(cfg)).library, await b.load());
    // Automatic incremental and manual full requests in one command serialize safely.
    await b.touchWord((await b.load()).words[0].id);
    const [queuedIncrement, queuedFull] = await Promise.all([
      backupRemote(b, cfg, { kind: "incremental" }),
      backupRemote(b, cfg, { kind: "full", force: true }),
    ]);
    assert.equal(queuedIncrement.increments?.length, 1);
    assert.equal(queuedFull.increments?.length, 0);
    assert.equal(
      (await b.getMeta<any>("webdav")).hash,
      createHash("sha256").update(JSON.stringify(queuedFull)).digest("hex"),
    );
    assert.deepEqual((await downloadBackup(cfg)).library, await b.load());
    // Snapshot retention counts the active full snapshot and retries failed deletions.
    await b.mutate((lib) => {
      lib.settings ??= {};
      lib.settings.backup = {
        fullHours: 24,
        incrementalMinutes: 5,
        retainFull: 3,
      };
    });
    rejectDelete = true;
    const retained = await backupRemote(b, cfg, { kind: "full", force: true });
    assert.equal(retained.fullHistory?.length, 3);
    assert.equal(retained.fullHistory?.[0], retained.file);
    assert.ok((await b.getMeta<any>("webdav")).cleanupPending.length > 0);
    const expired = (await b.getMeta<any>("webdav")).cleanupPending as string[];
    rejectDelete = false;
    await backupRemote(b, cfg, { kind: "incremental" });
    for (const file of expired) assert.ok(!files.has(`/backup/${file}`));
    for (const file of retained.fullHistory!)
      assert.ok(files.has(`/backup/${file}`));
    assert.deepEqual((await downloadBackup(cfg)).library, await b.load());
    // Reset is represented by deletions in the next increment, without stale rows.
    await b.resetLibrary();
    await backupRemote(b, cfg, { kind: "incremental" });
    assert.equal((await downloadBackup(cfg)).library.words.length, 0);
    const resetDownload = await downloadBackup(cfg);
    const c = new Store(join(root, "c"));
    await restoreRemote(c, cfg, resetDownload);
    assert.equal((await c.load()).words.length, 0);
    await c.mutate((lib) => {
      applyImport(lib, [["bonjour"]], ["word"]);
    });
    const afterRestore = await backupRemote(c, cfg, { kind: "incremental" });
    assert.equal(
      afterRestore.increments?.length,
      resetDownload.manifest.increments!.length + 1,
    );
    assert.equal((await downloadBackup(cfg)).library.words[0].word, "bonjour");
    // Explicit recovery preserves remote data without restoring it over local edits.
    const oldRemote = (await downloadBackup(cfg)).library;
    await c.mutate((lib) => {
      lib.words[0].notes = "Local authoritative edit";
    });
    const localBeforeRecovery = await c.load();
    await c.setMeta("webdav", null);
    await assert.rejects(
      backupRemote(c, cfg, { kind: "full", force: true }),
      /Remote backup is new/,
    );
    const beforeRecoveryFiles = new Set(files.keys());
    rejectIndex = true;
    await assert.rejects(
      backupRemote(c, cfg, { useLocal: true, force: true }),
      /Remote backup changed/,
    );
    assert.deepEqual((await downloadBackup(cfg)).library, oldRemote);
    rejectIndex = false;
    const recovered = await backupRemote(c, cfg, {
      useLocal: true,
      force: true,
    });
    assert.equal(recovered.increments?.length, 0);
    assert.deepEqual(await c.load(), localBeforeRecovery);
    assert.deepEqual((await downloadBackup(cfg)).library, localBeforeRecovery);
    const preserved = [...files.keys()].find(
      (name) =>
        !beforeRecoveryFiles.has(name) && name.includes("/permanent-backup-"),
    )!;
    assert.ok(preserved);
    const preservedLibrary = await (
      await import("../src/core/sqlite")
    ).readSQLiteBackup(
      await downloadResetArchive(cfg, preserved.split("/").pop()!),
    );
    // Materializing the standalone archive advances its revision, not its data.
    assert.deepEqual(
      { ...preservedLibrary, revision: oldRemote.revision },
      oldRemote,
    );
    await c.mutate((lib) => {
      lib.words[0].notes = "Normal backup works again";
    });
    await backupRemote(c, cfg, { kind: "incremental" });
    assert.deepEqual((await downloadBackup(cfg)).library, await c.load());
    const archive = await archiveBeforeReset(c, cfg);
    assert.ok(archive.file.startsWith("permanent-backup-"));
    const archiveBytes = await downloadResetArchive(cfg, archive.file);
    const legacyName = archive.file.replace(
      "permanent-backup-",
      "archive-before-reset-",
    );
    files.set("/backup/" + legacyName, Buffer.from(archiveBytes));
    assert.deepEqual(await downloadResetArchive(cfg, legacyName), archiveBytes);
    await deleteResetArchive(cfg, legacyName);
    assert.ok(!files.has("/backup/" + legacyName));
    assert.equal(
      (await import("../src/core/sqlite")).readSQLiteBackup instanceof Function,
      true,
    );
    const archivedLibrary = await (
      await import("../src/core/sqlite")
    ).readSQLiteBackup(archiveBytes);
    assert.equal(archivedLibrary.words[0].word, "bonjour");
    await c.touchWord(archivedLibrary.words[0].id);
    await assert.rejects(c.resetLibrary(archive));
    assert.equal((await c.load()).words.length, 1);
    const freshArchive = await archiveBeforeReset(c, cfg);
    await c.resetLibrary(freshArchive);
    await c.setMeta("backup-baseline", null);
    await c.mutate((lib) => applyImport(lib, [["salut"]], ["word"]));
    const restarted = await backupRemote(c, cfg, { kind: "incremental" });
    assert.equal(restarted.increments?.length, 0);
    assert.ok(files.has("/backup/" + archive.file));
    assert.equal(
      (
        await (
          await import("../src/core/sqlite")
        ).readSQLiteBackup(await downloadResetArchive(cfg, archive.file))
      ).words[0].word,
      "bonjour",
    );
    await deleteResetArchive(cfg, archive.file);
    assert.ok(!files.has("/backup/" + archive.file));
    await assert.rejects(deleteResetArchive(cfg, restarted.file));
    const latest = JSON.parse(files.get("/backup/latest.json")!.toString());
    files.set(`/backup/${latest.file}`, Buffer.from("corrupt"));
    await assert.rejects(downloadBackup(cfg), /checksum mismatch/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test("remote inventory parses namespaced responses and excludes other paths", () => {
  const xml =
    '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/backup/</d:href></d:response><d:response><d:href>/backup/a%20b.sqlite</d:href><d:propstat><d:prop><d:getcontentlength>123</d:getcontentlength><d:getlastmodified>Sat, 14 Nov 2026 12:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response><d:response><d:href>/elsewhere/no</d:href></d:response></d:multistatus>';
  assert.deepEqual(parseRemoteFiles(xml, "https://example.com/backup/"), [
    {
      name: "a b.sqlite",
      size: 123,
      modified: "Sat, 14 Nov 2026 12:00:00 GMT",
    },
  ]);
});
test("WebDAV target rejects insecure external HTTP and embedded credentials", () => {
  assert.throws(
    () => target({ url: "http://example.com/", username: "", password: "" }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      target({ url: "https://u:p@example.com/", username: "", password: "" }),
    /credentials/,
  );
  assert.throws(() =>
    target({ url: "https://example.com/?token=x", username: "", password: "" }),
  );
});
