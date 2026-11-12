import { environment, LocalStorage } from "@raycast/api";
import { mkdir, rmdir, stat } from "fs/promises";
import { join } from "path";
import { migrateKeyState, type KeyState } from "./key-state";

const STORAGE_KEY = "elevenlabs-keys-v1";

/** Short cross-command transaction. Never hold this lock during network I/O. */
export async function withStateLock<T>(work: () => Promise<T>): Promise<T> {
  await mkdir(environment.supportPath, { recursive: true, mode: 0o700 });
  const lock = join(environment.supportPath, "state.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await stat(lock);
    if (Date.now() - info.mtimeMs <= 60_000) throw new Error("Settings are busy; please try again");
    await rmdir(lock);
    await mkdir(lock, { mode: 0o700 });
  }
  try {
    return await work();
  } finally {
    await rmdir(lock);
  }
}

export async function updateKeys<T>(work: (state: KeyState) => T): Promise<T> {
  return withStateLock(async () => {
    const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
    const state: KeyState = raw ? JSON.parse(raw) : { keys: [] };
    migrateKeyState(state);
    const result = work(state);
    await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return result;
  });
}
