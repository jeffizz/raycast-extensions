import { Clipboard, showHUD } from "@raycast/api";
import { speakAndMaybeTranslate } from "./workflow";

export default async function Command() {
  let raw: string | null = null;
  try {
    raw = (await Clipboard.readText()) || null;
  } catch {
    raw = null;
  }

  const text = raw?.trim() || null;
  if (!text) {
    await showHUD("No text found in the clipboard");
    return;
  }

  await speakAndMaybeTranslate(text, text, "en");
}
