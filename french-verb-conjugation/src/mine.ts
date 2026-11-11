import { LocalStorage } from "@raycast/api";
import { book } from "./data";
import { resolveVerb } from "./model";

const KEY = "my-verbs";
const STATS_KEY = "practice-stats"; // Record<verbName, count>
const PRACTICE_RECENT_KEY = "practice-recent";
const LOOKUP_HISTORY_KEY = "lookup-history";

export type LookupHistoryEntry = { name: string; count: number };

export async function loadLookupHistory(): Promise<LookupHistoryEntry[]> {
  const raw = await LocalStorage.getItem<string>(LOOKUP_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is LookupHistoryEntry =>
      entry && typeof entry.name === "string" && Boolean(book.verbs[entry.name]) &&
      Number.isInteger(entry.count) && entry.count > 0,
    );
  } catch { return []; }
}

let lookupWrite: Promise<void> = Promise.resolve();
export function recordLookup(name: string): Promise<void> {
  const update = lookupWrite.then(async () => {
    if (!book.verbs[name]) return;
    const history = await loadLookupHistory();
    const existing = history.find((entry) => entry.name === name);
    const next = [{ name, count: (existing?.count ?? 0) + 1 }, ...history.filter((entry) => entry.name !== name)];
    await LocalStorage.setItem(LOOKUP_HISTORY_KEY, JSON.stringify(next));
  });
  lookupWrite = update.then(() => undefined, () => undefined);
  return update;
}

export async function loadRecentPractices(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(PRACTICE_RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((name): name is string => typeof name === "string" && Boolean(book.verbs[name])))];
  } catch { return []; }
}

export async function loadMine() {
  const raw = await LocalStorage.getItem<string>(KEY);
  if (!raw) return [];
  try {
    const names = JSON.parse(raw) as unknown;
    if (!Array.isArray(names)) return [];
    return names.filter((name): name is string => typeof name === "string" && Boolean(book.verbs[name]));
  } catch {
    return [];
  }
}

export async function saveMine(names: string[]) {
  await LocalStorage.setItem(KEY, JSON.stringify(names));
}

export async function addMine(name: string) {
  const list = await loadMine();
  if (list.includes(name)) return false;
  await saveMine([...list, name]);
  return true;
}

export async function removeMine(name: string) {
  const list = await loadMine();
  await saveMine(list.filter((item) => item !== name));
}

export function parseMine(text: string) {
  const tokens = text.split(/[\n,;，、]+/).map((item) => item.trim()).filter(Boolean);
  const known: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const name = resolveVerb(book, token);
    if (!name) {
      unknown.push(token);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    known.push(name);
  }
  return { known, unknown };
}

export function randomOf(list: string[]) {
  return list[Math.floor(Math.random() * list.length)] ?? "être";
}

// ===== 练习次数统计 =====

export async function loadStats(): Promise<Record<string, number>> {
  const raw = await LocalStorage.getItem<string>(STATS_KEY);
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") return obj as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

// Serialize updates within this command process so rapid checks do not overwrite each other.
let statsWrite: Promise<void> = Promise.resolve();

export function incrementPractices(names: string[]): Promise<Record<string, number>> {
  const update = statsWrite.then(async () => {
    const stats = await loadStats();
    const unique = [...new Set(names)].filter((name) => Boolean(book.verbs[name]));
    for (const name of unique) stats[name] = (stats[name] ?? 0) + 1;
    await LocalStorage.setItem(STATS_KEY, JSON.stringify(stats));
    const recent = await loadRecentPractices();
    await LocalStorage.setItem(PRACTICE_RECENT_KEY, JSON.stringify([...unique, ...recent.filter((name) => !unique.includes(name))]));
    return stats;
  });
  statsWrite = update.then(() => undefined, () => undefined);
  return update;
}

export async function incrementPractice(name: string) {
  const stats = await incrementPractices([name]);
  return stats[name];
}

export async function getPracticeCount(name: string): Promise<number> {
  const stats = await loadStats();
  return stats[name] ?? 0;
}
