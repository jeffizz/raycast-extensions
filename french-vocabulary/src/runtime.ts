import {
  environment,
  getPreferenceValues,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { Store } from "./core/sqlite";
import { emptyLibrary, Library } from "./core/model";
import {
  backupRemote,
  backupDue,
  target,
  BackupState,
  BackupConfig,
} from "./core/backup";
export type Preferences = {
  languageMode?: "zh-first" | "en-first" | "zh-only" | "en-only";
  listPOS?: "right" | "below" | "hidden";
  webdavUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  autoBackup?: boolean;
};
export const preferences = () => getPreferenceValues<Preferences>();
export const store = new Store(environment.supportPath);
export function webdavConfig(): BackupConfig {
  const p = preferences();
  if (!p.webdavUrl?.trim())
    throw Error(
      "Configure a WebDAV backup folder in extension preferences first.",
    );
  return {
    url: p.webdavUrl.trim(),
    username: p.webdavUsername ?? "",
    password: p.webdavPassword ?? "",
  };
}
export async function report(error: unknown) {
  await showToast({
    style: Toast.Style.Failure,
    title: "Operation failed",
    message: error instanceof Error ? error.message : "Unexpected error",
  });
}
let backingUp: Promise<unknown> | undefined;
let lastBackupCheck = 0;
const backupListeners = new Set<() => void>();
export function onBackupChange(listener: () => void) {
  backupListeners.add(listener);
  return () => {
    backupListeners.delete(listener);
  };
}
export async function autoBackup() {
  if (!preferences().autoBackup || !preferences().webdavUrl) return;
  if (backingUp) {
    await backingUp.catch(() => {});
    return;
  }
  if (Date.now() - lastBackupCheck < 15000) return;
  lastBackupCheck = Date.now();
  backingUp = (async () => {
    const lib =
      await store.getMeta<Pick<Library, "settings" | "revision" | "libraryId">>(
        "header",
      );
    const state = await store.getMeta<BackupState>("webdav");
    if (!lib) return;
    const config = webdavConfig();
    const kind = backupDue(
      lib,
      state?.target === target(config) ? state : undefined,
    );
    if (kind)
      await backupRemote(store, config, { kind, force: kind === "full" });
  })();
  try {
    await backingUp;
  } catch (e) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Saved locally; WebDAV backup pending",
      message: e instanceof Error ? e.message : "Backup failed",
    });
  } finally {
    backingUp = undefined;
    for (const listener of backupListeners) listener();
  }
}
export function useLibrary(includeHistory = true, todayOnly = false) {
  const [lib, setLib] = useState<Library>(emptyLibrary),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      setLib(
        await store.load(
          includeHistory,
          todayOnly ? start.toISOString() : undefined,
        ),
      );
    } catch (e) {
      await report(e);
    } finally {
      setLoading(false);
    }
  }, [includeHistory, todayOnly]);
  useEffect(() => {
    void refresh().then(() => autoBackup());
  }, [refresh]);
  const mutate = async (fn: (l: Library) => void | Promise<void>) => {
    try {
      await store.mutate(fn);
      await refresh();
      await autoBackup();
    } catch (e) {
      await report(e);
      throw e;
    }
  };
  return { lib, loading, refresh, mutate };
}
