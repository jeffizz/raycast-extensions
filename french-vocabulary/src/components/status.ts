import { indicatorColors } from "../core/indicator-colors";
import { Word } from "../core/model";
const cache = new Map<string, string>();
export function enrichmentStatus(word: Word) {
  const colors = indicatorColors();
  const types = [
    word.examples.length
      ? {
          name: "Examples",
          color: colors.examples,
          detail: `Exp(${word.examples.length})`,
        }
      : undefined,
    word.familyLinks?.length
      ? {
          name: "Word Family",
          color: colors.family,
          detail: `Family(${word.familyLinks.length})`,
        }
      : undefined,
    word.collocationEntries?.length || word.collocations?.trim()
      ? {
          name: "Collocations",
          color: colors.collocations,
          detail: `Coll(${word.collocationEntries?.length || (word.collocations?.trim() ? "+" : 0)})`,
        }
      : undefined,
    word.mnemonic?.trim()
      ? {
          name: "Mnemonic",
          color: colors.mnemonic,
          detail: "Mnemonic",
        }
      : undefined,
  ].filter(
    (value): value is { name: string; color: string; detail: string } =>
      !!value,
  );
  return {
    color: types.length > 1 ? colors.multiple : types[0]?.color,
    details: types
      .filter((t) => types.length <= 3 || t.name !== "Mnemonic")
      .map((t) => t.detail),
  };
}
/** One fixed-width slot: enrichment ring around the familiarity symbol. */
export function statusIcon(w: Word): string | undefined {
  const state = w.familiarity === "unknown" ? "fuzzy" : w.familiarity;
  const ringColor = enrichmentStatus(w).color;
  return renderStatusIcon(state, ringColor);
}
/** Shared by real rows and the colour picker; preview never changes the saved palette. */
export function renderStatusIcon(
  state: Word["familiarity"],
  ringColor?: string,
): string | undefined {
  if (ringColor && !/^#[0-9a-f]{6}$/i.test(ringColor))
    throw Error("Invalid ring colour.");
  if (!ringColor && state !== "fuzzy" && state !== "known") return;
  const key = state + ":" + (ringColor ?? "");
  if (cache.has(key)) return cache.get(key);
  const color = state === "fuzzy" ? "#f5a623" : "#54bd76";
  const symbol =
    state === "fuzzy"
      ? '<g transform="translate(8 8) scale(0.85) translate(-8 -8)"><path d="M5 5a3 3 0 1 1 4 3c-1 .5-1 1-1 2"/><path d="M8 13h.01" stroke-width="2.5"/></g>'
      : state === "known"
        ? '<path d="M4 8l3 3 6-7"/>'
        : "";
  const ring = ringColor
    ? `<circle cx="8" cy="8" r="7" fill="none" stroke="${ringColor}" stroke-width="1.2"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>${ring}</svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  if (cache.size >= 32) cache.clear();
  cache.set(key, uri);
  return uri;
}
export function statusTooltip(word: Word) {
  const familiarity =
    word.familiarity === "known"
      ? "Know"
      : ["fuzzy", "unknown"].includes(word.familiarity)
        ? "Fuzzy"
        : "Unmarked";
  return [familiarity, ...enrichmentStatus(word).details].join("\n");
}
