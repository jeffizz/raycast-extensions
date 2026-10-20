import { Clipboard, showHUD } from "@raycast/api";
import { formatConjugation } from "./conjugation";
import { pronounceText } from "./pronounce";

/** Pronounce Excel conjugation cells or the complete trimmed clipboard text. */
export default async function Command() {
  let raw: string | null = null;
  try {
    raw = (await Clipboard.readText()) || null;
  } catch {
    raw = null;
  }

  if (!raw?.trim()) {
    await showHUD("No text found in the clipboard");
    return;
  }

  const conjugation = formatConjugation(raw);
  await pronounceText(conjugation ?? raw, "No text found in the clipboard");
}
