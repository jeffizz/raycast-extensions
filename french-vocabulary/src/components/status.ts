import { Word } from "../core/model";
const cache = new Map<string, string>();
/** One fixed-width slot: practice adds a ring around the familiarity symbol. */
export function statusIcon(w: Word): string | undefined {
  const state = w.familiarity === "unknown" ? "fuzzy" : w.familiarity;
  if (!w.practice && state !== "fuzzy" && state !== "known") return;
  const key = `${+w.practice}:${state}`;
  if (cache.has(key)) return cache.get(key);
  const color = state === "fuzzy" ? "#f5a623" : "#54bd76";
  const symbol =
    state !== "known" && state !== "fuzzy"
      ? ""
      : state === "fuzzy"
        ? '<path d="M5 5a3 3 0 1 1 4 3c-1 .5-1 1-1 2"/><path d="M8 13h.01" stroke-width="2.5"/>'
        : '<path d="M4 8l3 3 6-7"/>';
  const ring = w.practice
    ? '<circle cx="8" cy="8" r="7" fill="none" stroke="#52a8ff" stroke-width="1.2"/>'
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>${ring}</svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  cache.set(key, uri);
  return uri;
}
