import { getSelectedText, showHUD } from "@raycast/api";
import { playSpeech } from "./speech";

function trimText(raw: string | null): string | null {
  const text = raw?.trim() ?? "";
  return text || null;
}

export default async function Command() {
  let raw: string | null = null;
  try {
    raw = await getSelectedText();
  } catch {
    raw = null;
  }

  const text = trimText(raw);
  if (!text) {
    await showHUD("No selected text found — select text first");
    return;
  }

  try {
    await playSpeech(text, "en");
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }
}
