import { createHash } from "node:crypto";
import { Library, now, uid, validateLibrary } from "./model";
import { Store, readSQLiteBackup } from "./sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDelta, baseline, Baseline, Delta, makeDelta } from "./delta";

export type Increment = {
  file: string;
  sha256: string;
  from: number;
  to: number;
};
export const backupPolicy = (lib: Pick<Library, "settings">) =>
  lib.settings?.backup ?? { fullHours: 24, incrementalMinutes: 5 };
export function backupDue(
  lib: Pick<Library, "settings" | "revision" | "libraryId">,
  state: BackupState | undefined,
  at = Date.now(),
) {
  if (!state || state.libraryId !== lib.libraryId || !state.fullAt)
    return "full";
  if (at - Date.parse(state.fullAt) >= backupPolicy(lib).fullHours * 3600000)
    return "full";
  if (
    (state.revision !== lib.revision || state.cleanupPending?.length) &&
    (!state.at ||
      at - Date.parse(state.at) >= backupPolicy(lib).incrementalMinutes * 60000)
  )
    return "incremental";
  return undefined;
}
const manifestHash = (m: Manifest) => digest(JSON.stringify(m));

export type BackupConfig = { url: string; username: string; password: string };
export type Manifest = {
  format: 1 | 2;
  file: string;
  sha256: string;
  libraryId: string;
  revision: number;
  words: number;
  at: string;
  fullAt?: string;
  snapshotRevision?: number;
  increments?: Increment[];
};
export type BackupState = {
  at?: string;
  revision?: number;
  libraryId?: string;
  hash?: string;
  error?: string;
  target?: string;
  fullAt?: string;
  kind?: "full" | "incremental";
  increments?: number;
  cleanupPending?: string[];
};
const digest = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
export function target(c: BackupConfig) {
  const u = new URL(c.url);
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw Error(
      "Use HTTPS for WebDAV (HTTP is only allowed for localhost tests).",
    );
  if (u.username || u.password || u.search || u.hash)
    throw Error(
      "Use the username/password preferences, without credentials or query parameters in the URL.",
    );
  return u.href.replace(/\/*$/, "/");
}
function headers(c: BackupConfig) {
  return {
    Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`,
  };
}
async function request(c: BackupConfig, file: string, init: RequestInit = {}) {
  // Do not forward credentials across redirects or place server responses in errors.
  let r: Response;
  try {
    r = await fetch(target(c) + file, {
      ...init,
      headers: { ...headers(c), ...init.headers },
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw Error(
      "WebDAV connection failed. Check the HTTPS folder URL and network; redirects are not followed.",
    );
  }
  return r;
}
async function limitedBody(r: Response) {
  const max = 128 * 1024 * 1024;
  if (Number(r.headers.get("content-length") || 0) > max)
    throw Error("Backup exceeds the 128 MB safety limit.");
  const reader = r.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const v = await reader.read();
    if (v.done) break;
    n += v.value.length;
    if (n > max) {
      await reader.cancel();
      throw Error("Backup exceeds the 128 MB safety limit.");
    }
    parts.push(v.value);
  }
  return Buffer.concat(parts);
}
export async function remoteManifest(
  c: BackupConfig,
): Promise<{ manifest?: Manifest; etag?: string }> {
  const r = await request(c, "latest.json");
  if (r.status === 404) return {};
  if (!r.ok)
    throw Error(`WebDAV could not read the backup index (HTTP ${r.status}).`);
  let m: Manifest;
  try {
    m = JSON.parse((await limitedBody(r)).toString("utf8"));
  } catch {
    throw Error("Invalid remote backup index.");
  }
  if (
    ![1, 2].includes(m.format) ||
    !(
      m.format === 2 ? /^snapshot-[\w-]+\.sqlite$/ : /^snapshot-[\w-]+\.json$/
    ).test(m.file) ||
    !/^[a-f0-9]{64}$/.test(m.sha256) ||
    typeof m.libraryId !== "string" ||
    !Number.isSafeInteger(m.revision) ||
    !Number.isFinite(Date.parse(m.at))
  )
    throw Error("Invalid remote backup index.");
  if (m.increments !== undefined) {
    if (
      m.format !== 2 ||
      !Array.isArray(m.increments) ||
      m.increments.length > 128 ||
      !Number.isSafeInteger(m.snapshotRevision) ||
      !m.fullAt ||
      !Number.isFinite(Date.parse(m.fullAt))
    )
      throw Error("Invalid incremental backup index.");
    let revision = m.snapshotRevision!;
    const files = new Set<string>();
    for (const d of m.increments) {
      if (
        !d ||
        !/^delta-[\w-]+\.json$/.test(d.file) ||
        files.has(d.file) ||
        !/^[a-f0-9]{64}$/.test(d.sha256) ||
        d.from !== revision ||
        !Number.isSafeInteger(d.to) ||
        d.to <= d.from
      )
        throw Error("Broken incremental backup index.");
      files.add(d.file);
      revision = d.to;
    }
    if (revision !== m.revision)
      throw Error("Broken incremental backup index.");
  }
  return { manifest: m, etag: r.headers.get("etag") ?? undefined };
}
export async function downloadBackup(
  c: BackupConfig,
): Promise<{ library: Library; manifest: Manifest }> {
  const { manifest: m } = await remoteManifest(c);
  if (!m) throw Error("No backup found in this WebDAV folder.");
  const r = await request(c, m.file);
  if (!r.ok) throw Error(`Cannot download backup (HTTP ${r.status}).`);
  const body = await limitedBody(r);
  if (digest(body) !== m.sha256)
    throw Error("Backup checksum mismatch. The local library was not changed.");
  let library: Library =
    m.format === 2
      ? await readSQLiteBackup(body)
      : JSON.parse(body.toString("utf8"));
  validateLibrary(library);
  if (
    library.libraryId !== m.libraryId ||
    library.revision !== (m.snapshotRevision ?? m.revision)
  )
    throw Error("Backup metadata does not match its contents.");
  for (const increment of m.increments ?? []) {
    const response = await request(c, increment.file);
    if (!response.ok)
      throw Error(`Cannot download increment (HTTP ${response.status}).`);
    const bytes = await limitedBody(response);
    if (digest(bytes) !== increment.sha256)
      throw Error(
        "Increment checksum mismatch. The local library was not changed.",
      );
    const delta: Delta = JSON.parse(bytes.toString("utf8"));
    if (delta.from !== increment.from || delta.to !== increment.to)
      throw Error("Increment metadata mismatch.");
    library = applyDelta(library, delta);
  }
  if (library.revision !== m.revision || library.words.length !== m.words)
    throw Error("Backup metadata does not match restored contents.");
  return { library, manifest: m };
}
async function cleanupIncrements(
  store: Store,
  c: BackupConfig,
  files: string[],
  manifest: Manifest,
) {
  const active = new Set(
    (manifest.increments ?? []).map((increment) => increment.file),
  );
  const cleanupPending: string[] = [];
  for (const file of new Set(files)) {
    if (!/^delta-[\w-]+\.json$/.test(file) || active.has(file)) continue;
    try {
      const response = await request(c, file, { method: "DELETE" });
      if (!response.ok && response.status !== 404) cleanupPending.push(file);
    } catch {
      cleanupPending.push(file);
    }
  }
  await store.setMeta("webdav", {
    ...(await store.getMeta<BackupState>("webdav")),
    error: undefined,
    cleanupPending: cleanupPending.length ? cleanupPending : undefined,
  });
}
type BackupOptions = { kind?: "full" | "incremental"; force?: boolean };
const backupQueues = new Map<string, Promise<Manifest>>();
export async function backupRemote(
  store: Store,
  c: BackupConfig,
  options: BackupOptions = {},
): Promise<Manifest> {
  // Manual and automatic backups share one queue in the current command process.
  // Conditional index writes still protect against other commands/devices.
  const previous = backupQueues.get(store.path);
  const task = (previous ?? Promise.resolve())
    .catch(() => {})
    .then(() => uploadBackup(store, c, options));
  backupQueues.set(store.path, task);
  try {
    return await task;
  } finally {
    if (backupQueues.get(store.path) === task) backupQueues.delete(store.path);
  }
}
async function uploadBackup(
  store: Store,
  c: BackupConfig,
  options: BackupOptions,
): Promise<Manifest> {
  const t = target(c);
  try {
    let lib = await store.load();
    const previous = await store.getMeta<BackupState>("webdav"),
      remote = await remoteManifest(c);
    if (remote.manifest) {
      const trusted =
        previous?.target === t &&
        previous.hash === manifestHash(remote.manifest);
      if (!trusted)
        throw Error(
          "Remote backup is new or changed. Inspect and restore it first, or use a different empty WebDAV folder. Nothing was overwritten.",
        );
      if (!remote.etag || remote.etag.startsWith("W/"))
        throw Error(
          "This server does not provide a strong ETag for safe backup-index updates. Use local export or a compatible WebDAV server.",
        );
      if (
        !options.force &&
        remote.manifest.format === 2 &&
        previous?.revision === lib.revision &&
        previous?.libraryId === lib.libraryId
      ) {
        await cleanupIncrements(
          store,
          c,
          previous?.cleanupPending ?? [],
          remote.manifest,
        );
        return remote.manifest;
      }
    }
    const prior = await store.getMeta<Baseline>("backup-baseline");
    let incremental =
      options.kind === "incremental" &&
      remote.manifest?.format === 2 &&
      prior?.libraryId === lib.libraryId &&
      prior?.revision === remote.manifest.revision &&
      lib.revision > prior.revision &&
      (remote.manifest.increments?.length ?? 0) < 128;
    let body: Buffer;
    if (incremental) {
      body = Buffer.from(JSON.stringify(makeDelta(prior!, lib)));
      // Large deltas are less useful than a fresh compact snapshot.
      if (body.length > 8 * 1024 * 1024) incremental = false;
    }
    if (!incremental) {
      const root = await mkdtemp(join(tmpdir(), "fv-upload-"));
      try {
        const path = await store.exportSQLite(join(root, "backup.sqlite"));
        body = await readFile(path);
        lib = await readSQLiteBackup(body);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
    if (body!.length > 128 * 1024 * 1024)
      throw Error("Backup exceeds the 128 MB safety limit.");
    const file = `${incremental ? "delta" : "snapshot"}-${now().replace(/[:.]/g, "-")}-${uid()}.${incremental ? "json" : "sqlite"}`;
    const m: Manifest = incremental
      ? {
          ...remote.manifest!,
          snapshotRevision:
            remote.manifest!.snapshotRevision ?? remote.manifest!.revision,
          fullAt: remote.manifest!.fullAt ?? remote.manifest!.at,
          increments: [
            ...(remote.manifest!.increments ?? []),
            {
              file,
              sha256: digest(body!),
              from: prior!.revision,
              to: lib.revision,
            },
          ],
          revision: lib.revision,
          words: lib.words.length,
          at: now(),
        }
      : {
          format: 2,
          file,
          sha256: digest(body!),
          libraryId: lib.libraryId,
          revision: lib.revision,
          snapshotRevision: lib.revision,
          words: lib.words.length,
          at: now(),
          fullAt: now(),
          increments: [],
        };
    const put = await request(c, file, {
      method: "PUT",
      headers: {
        "Content-Type": incremental
          ? "application/json"
          : "application/vnd.sqlite3",
        "If-None-Match": "*",
      },
      body: new Uint8Array(body!),
    });
    if (!put.ok) throw Error(`Cannot upload backup (HTTP ${put.status}).`);
    // Verify the actual stored snapshot before publishing the pointer.
    const verify = await request(c, file);
    if (!verify.ok || digest(await limitedBody(verify)) !== digest(body!))
      throw Error(
        "Uploaded snapshot failed verification. Previous backup remains current.",
      );
    const update = await request(c, "latest.json", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(remote.etag
          ? { "If-Match": remote.etag }
          : { "If-None-Match": "*" }),
      },
      body: JSON.stringify(m),
    });
    if (!update.ok)
      throw Error(
        update.status === 412
          ? "Remote backup changed during upload. Snapshot was kept; inspect the remote backup before retrying."
          : `Cannot publish backup index (HTTP ${update.status}).`,
      );
    const obsolete = [
      ...new Set([
        ...(previous?.target === t ? (previous.cleanupPending ?? []) : []),
        ...(!incremental
          ? (remote.manifest?.increments ?? []).map((d) => d.file)
          : []),
      ]),
    ].filter((file) => !(m.increments ?? []).some((d) => d.file === file));
    await store.setMetas({
      webdav: {
        at: m.at,
        revision: lib.revision,
        libraryId: lib.libraryId,
        hash: manifestHash(m),
        target: t,
        fullAt: m.fullAt ?? m.at,
        kind: incremental ? "incremental" : "full",
        increments: m.increments?.length ?? 0,
        cleanupPending: obsolete,
      } satisfies BackupState,
      "backup-baseline": baseline(lib),
    });
    // Publish and persist the new standalone snapshot before deleting old deltas.
    // Never delete snapshots: old full copies remain a safety fallback.
    await cleanupIncrements(store, c, obsolete, m);
    return m;
  } catch (e) {
    const old = await store.getMeta<BackupState>("webdav");
    await store.setMeta("webdav", {
      ...old,
      error: e instanceof Error ? e.message : "Backup failed.",
    });
    throw e;
  }
}
export async function restoreRemote(
  store: Store,
  c: BackupConfig,
  download: { library: Library; manifest: Manifest },
) {
  validateLibrary(download.library);
  // Staged data may be older than the current server pointer; that is intentional and visible in preview.
  await store.backupLocal("before-webdav-restore");
  const local = await store.load();
  await store.save(
    structuredClone(download.library),
    local.revision,
    local.libraryId,
    true,
  );
  await store.setMetas({
    webdav: {
      at: now(),
      revision: download.library.revision,
      libraryId: download.library.libraryId,
      hash: manifestHash(download.manifest),
      target: target(c),
      fullAt: download.manifest.fullAt ?? download.manifest.at,
      increments: download.manifest.increments?.length ?? 0,
    } satisfies BackupState,
    "backup-baseline": baseline(download.library),
  });
}
