import { Clipboard, showHUD } from "@raycast/api";
import { playSpeech } from "./speech";

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

  try {
    await playSpeech(text, "en");
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }
}
