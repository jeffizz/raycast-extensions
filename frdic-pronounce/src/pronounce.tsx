import { getSelectedText as getRaycastSelectedText, showHUD } from "@raycast/api";
import { formatConjugation, stripBoundaryParentheses } from "./conjugation";
import { speakAndMaybeTranslate } from "./workflow";

function trimSelectedText(raw: string): string | null {
  const text = raw.trim();
  return text || null;
}

export default async function Command() {
  let raw: string | null = null;
  try {
    raw = await getRaycastSelectedText();
  } catch {
    raw = null;
  }

  const cleaned = raw ? stripBoundaryParentheses(raw) : "";
  const text = trimSelectedText(cleaned);
  if (!text) {
    await showHUD("No selected text found — select text first");
    return;
  }

  await speakAndMaybeTranslate(formatConjugation(text) ?? text, text, "fr");
}
