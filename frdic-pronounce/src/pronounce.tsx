import { getSelectedText as getRaycastSelectedText, showHUD } from "@raycast/api";
import { formatConjugation, stripBoundaryParentheses } from "./conjugation";
import { playSpeech } from "./speech";

/** Remove only leading and trailing whitespace; preserve the selected text itself. */
function trimSelectedText(raw: string): string | null {
  const text = raw.trim();
  return text || null;
}

export async function pronounceText(raw: string | null, emptyMessage: string): Promise<void> {
  const text = raw ? trimSelectedText(stripBoundaryParentheses(raw)) : null;
  if (!text) {
    await showHUD(emptyMessage);
    return;
  }

  try {
    await playSpeech(text, "fr");
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }
}

export default async function Command() {
  // Read selected text through Raycast's native selected-text API.
  let raw: string | null = null;
  try {
    raw = await getRaycastSelectedText();
  } catch {
    raw = null;
  }

  const cleaned = raw ? stripBoundaryParentheses(raw) : raw;
  await pronounceText(formatConjugation(cleaned ?? "") ?? cleaned, "No selected text found — select text first");
}
