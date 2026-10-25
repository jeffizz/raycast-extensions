import { getSelectedText, showHUD } from "@raycast/api";
import { speakAndMaybeTranslate } from "./workflow";

export default async function Command() {
  let raw: string | null = null;
  try {
    raw = await getSelectedText();
  } catch {
    raw = null;
  }

  const text = raw?.trim() || null;
  if (!text) {
    await showHUD("No selected text found — select text first");
    return;
  }

  await speakAndMaybeTranslate(text, text, "en");
}
