import { getSelectedText, showHUD } from "@raycast/api";
import { formatConjugation, stripBoundaryParentheses } from "./conjugation";
import { speakAndMaybeTranslate } from "./workflow";
import { validateText } from "./text-safety";
import { getPreferences } from "./preferences";

export default async function Command() {
  try {
    const raw = validateText(await getSelectedText(), getPreferences().strictPrivacyChecks !== false);
    const text = stripBoundaryParentheses(raw);
    await speakAndMaybeTranslate(formatConjugation(text) ?? text, text, "fr");
  } catch (error) {
    await showHUD(error instanceof Error ? error.message : "Unable to read selected text");
  }
}
