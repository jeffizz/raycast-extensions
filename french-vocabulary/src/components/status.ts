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
    multiple: types.length > 1,
    color: types.length > 1 ? colors.multiple : types[0]?.color,
    details: types
      .filter((t) => types.length <= 3 || t.name !== "Mnemonic")
      .map((t) => t.detail),
  };
}
/** One fixed-width slot for enrichment, familiarity and chat history. */
export function statusIcon(w: Word, hasChat = false): string | undefined {
  const state = w.familiarity === "unknown" ? "fuzzy" : w.familiarity;
  const { color, multiple } = enrichmentStatus(w);
  return renderStatusIcon(state, color, multiple, hasChat);
}
/** Shared by real rows and the colour picker; preview never changes the saved palette. */
export function renderStatusIcon(
  state: Word["familiarity"],
  ringColor?: string,
  multiple = false,
  hasChat = false,
  chatInk = indicatorColors().chat,
): string | undefined {
  if (ringColor && !/^#[0-9a-f]{6}$/i.test(ringColor))
    throw Error("Invalid ring colour.");
  if (!ringColor && !hasChat && state !== "fuzzy" && state !== "known") return;
  if (hasChat && !/^#[0-9a-f]{6}$/i.test(chatInk))
    throw Error("Invalid chat colour.");
  const key = `${state}:${ringColor ?? ""}:${multiple}:${hasChat ? chatInk : ""}`;
  if (cache.has(key)) return cache.get(key);
  const color = state === "fuzzy" ? "#f5a623" : "#54bd76";
  const symbol =
    state === "fuzzy"
      ? '<g transform="translate(8 8) scale(0.85) translate(-8 -8)"><path d="M5 5a3 3 0 1 1 4 3c-1 .5-1 1-1 2"/><path d="M8 13h.01" stroke-width="2.5"/></g>'
      : state === "known"
        ? '<path d="M4 8l3 3 6-7"/>'
        : "";
  // Keep only the four exterior arcs of the overlapping circles, leaving the centre clear.
  const outline = ringColor
    ? multiple
      ? `<path d="M3.61 3.61 A5 5 0 0 1 12.39 3.61 A5 5 0 0 1 12.39 12.39 A5 5 0 0 1 3.61 12.39 A5 5 0 0 1 3.61 3.61 Z" fill="none" stroke="${ringColor}" stroke-width="1.2" stroke-linejoin="round"/>`
      : `<circle cx="8" cy="8" r="7" fill="none" stroke="${ringColor}" stroke-width="1.2"/>`
    : hasChat
      ? `<path d="M4.5 1.5H11.5Q15 1.5 15 5V9.5Q15 13 11.5 13H7L3.5 15V12.9Q1 12.3 1 9.5V5Q1 1.5 4.5 1.5Z" fill="none" stroke="${chatInk}" stroke-width="1.1" stroke-linejoin="round"/>`
      : "";
  const badge =
    hasChat && ringColor
      ? `<circle cx="13.8" cy="2.2" r="1.85" fill="${chatInk}"/>`
      : "";
  // Knock out nearby outline pixels so even identical colours stay visually separate.
  const decoratedOutline = badge
    ? `<defs><mask id="chat-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect width="16" height="16" fill="#fff"/><circle cx="13.8" cy="2.2" r="2.6" fill="#000"/></mask></defs><g mask="url(#chat-gap)">${outline}</g>`
    : outline;
  const glyphOffset =
    multiple && ringColor
      ? ' transform="translate(8 8) scale(0.82) translate(-8 -8)"'
      : hasChat && !ringColor
        ? ' transform="translate(0 -0.65)"'
        : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${decoratedOutline}${badge}<g fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${glyphOffset}>${symbol}</g></svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  if (cache.size >= 32) cache.clear();
  cache.set(key, uri);
  return uri;
}
export function statusTooltip(word: Word, hasChat = false) {
  const familiarity =
    word.familiarity === "known"
      ? "Know"
      : ["fuzzy", "unknown"].includes(word.familiarity)
        ? "Fuzzy"
        : "Unmarked";
  return [
    familiarity,
    ...enrichmentStatus(word).details,
    ...(hasChat ? ["Word Chat History"] : []),
  ].join("\n");
}
