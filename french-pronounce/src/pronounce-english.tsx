import { getSelectedText, showHUD } from "@raycast/api";
import { speakAndMaybeTranslate } from "./workflow";
import { validateText } from "./text-safety";
import { getPreferences } from "./preferences";

export default async function Command() {
  try {
    const text = validateText(await getSelectedText(), getPreferences().strictPrivacyChecks !== false);
    await speakAndMaybeTranslate(text, text, "en");
  } catch (error) {
    await showHUD(error instanceof Error ? error.message : "Unable to read selected text");
  }
}
