import { showHUD } from "@raycast/api";
import { isPronunciationEnabled } from "./preferences";
import { playSpeech, type Language } from "./speech";
import { showTranslationIfEnabled } from "./translate";

/**
 * Play pronunciation (if enabled) and, if a translation engine is configured,
 * show the Chinese translation. Translation uses `translateText` (cleaned
 * source), never the TTS conjugation template.
 */
export async function speakAndMaybeTranslate(
  speechText: string,
  translateText: string,
  language: Language,
): Promise<void> {
  const translation = showTranslationIfEnabled(translateText, language);

  if (isPronunciationEnabled()) {
    try {
      await playSpeech(speechText, language);
    } catch (error) {
      await showHUD(`❌ Failed: ${(error as Error).message}`);
    }
  }

  await translation;
}
