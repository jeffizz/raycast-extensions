import { showHUD } from "@raycast/api";
import { playSpeech, type Language } from "./speech";
import { showTranslationIfEnabled } from "./translate";
import { validateText } from "./text-safety";
import { getPreferences } from "./preferences";

/**
 * Play pronunciation and, if a translation engine is configured, show the
 * Chinese translation in a toast. Translation uses `translateText` (cleaned
 * source), never the TTS conjugation template.
 */
export async function speakAndMaybeTranslate(
  speechText: string,
  translateText: string,
  language: Language,
): Promise<void> {
  // Validate both payloads before starting ANY third-party request.
  const strict = getPreferences().strictPrivacyChecks !== false;
  const safeSpeech = validateText(speechText, strict);
  const safeTranslation = validateText(translateText, strict);
  const translation = showTranslationIfEnabled(safeTranslation, language);

  try {
    await playSpeech(safeSpeech, language);
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }

  await translation;
}
