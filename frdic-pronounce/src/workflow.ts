import { showHUD } from "@raycast/api";
import { playSpeech, type Language } from "./speech";
import { showTranslationIfEnabled } from "./translate";

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
  const translation = showTranslationIfEnabled(translateText, language);

  try {
    await playSpeech(speechText, language);
  } catch (error) {
    await showHUD(`❌ Failed: ${(error as Error).message}`);
  }

  await translation;
}
