import { LocalStorage } from "@raycast/api";
import { book } from "./data";
import { resolveVerb } from "./model";

const KEY = "my-verbs";

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
