import { Clipboard, getSelectedText } from "@raycast/api";
import { book } from "./data";
import { resolveVerb } from "./model";

export type LaunchVerb = { query: string; infinitive: string | null };

/** Selected word first, otherwise a short clipboard snippet. */
export async function verbFromContext(fallbackText?: string | null): Promise<LaunchVerb> {
  const typed = tidy(fallbackText ?? "");
  if (typed) return finish(typed);

  try {
    const selected = tidy(await getSelectedText());
    if (selected) return finish(selected);
  } catch {
    // Frontmost app had no selection.
  }

  try {
    const clip = await Clipboard.readText();
    const word = shortSnippet(clip ?? "");
    if (word) return finish(word);
  } catch {
    // Clipboard unreadable.
  }

  return { query: "", infinitive: null };
}

function finish(query: string): LaunchVerb {
  const infinitive = resolveVerb(book, query);
  if (!infinitive) return { query: "", infinitive: null };
  return { query, infinitive };
}

function shortSnippet(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40 || trimmed.split(/\s+/).length > 3) return "";
  return tidy(trimmed);
}

export function tidy(raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}
