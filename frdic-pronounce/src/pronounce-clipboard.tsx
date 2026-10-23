import { Clipboard, showHUD } from "@raycast/api";
import { formatConjugation, stripBoundaryParentheses } from "./conjugation";
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

  const cleaned = stripBoundaryParentheses(raw);
  const conjugation = formatConjugation(cleaned);
  await pronounceText(conjugation ?? cleaned, "No text found in the clipboard");
}
