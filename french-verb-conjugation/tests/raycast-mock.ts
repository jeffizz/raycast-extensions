import { join } from "node:path";

export const environment = { assetsPath: join(process.cwd(), "assets") };

const storage = new Map<string, string>();

export const LocalStorage = {
  async getItem(key: string) { return storage.get(key); },
  async setItem(key: string, value: string) { storage.set(key, value); },
};
