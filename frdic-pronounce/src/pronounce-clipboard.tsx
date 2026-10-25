import { Clipboard, showHUD } from "@raycast/api";
import { formatConjugation, stripBoundaryParentheses } from "./conjugation";
import { speakAndMaybeTranslate } from "./workflow";

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
  if (!cleaned) {
    await showHUD("No text found in the clipboard");
    return;
  }

  await speakAndMaybeTranslate(formatConjugation(cleaned) ?? cleaned, cleaned, "fr");
}
