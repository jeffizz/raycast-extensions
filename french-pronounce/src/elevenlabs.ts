import { getPreferences } from "./preferences";
import type { Language } from "./speech";
import { updateKeys } from "./state";
import { failKey, reserveKey } from "./key-state";
import { characterCount } from "./text-safety";
import { describeElevenError } from "./elevenlabs-errors";

export const DEFAULT_VOICES = { fr: "FvmvwvObRqIHojkEGh5N", en: "bGnz83yTAb7caZSC7BBz" } as const;
export const ELEVEN_MODELS = ["eleven_v4", "eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"] as const;

export interface ElevenConfig {
  voiceId: string;
  model: string;
  language: Language;
  settings: { stability: number; similarity_boost: number; style: number; speed: number };
}

function numeric(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return number;
}

export function getElevenConfig(language: Language): ElevenConfig {
  const prefs = getPreferences();
  const voiceId = (language === "fr" ? prefs.elevenFrenchVoiceId : prefs.elevenEnglishVoiceId)?.trim() || DEFAULT_VOICES[language];
  if (!voiceId || !/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId)) {
    throw new Error(`Set a valid ElevenLabs ${language === "fr" ? "French" : "English"} Voice ID in extension preferences`);
  }
  const model = prefs.elevenModel ?? "eleven_v4";
  if (!(ELEVEN_MODELS as readonly string[]).includes(model)) {
    throw new Error("Select a supported ElevenLabs model in preferences");
  }
  return {
    voiceId,
    language,
    model,
    settings: {
      // v3 only accepts discrete stability values. Map legacy/custom values to the nearest supported mode.
      stability: model === "eleven_v3"
        ? Math.round(numeric(prefs.elevenStability, 0.5, 0, 1, "Stability") * 2) / 2
        : numeric(prefs.elevenStability, 0.65, 0, 1, "Stability"),
      similarity_boost: model === "eleven_v3" ? 0.75 : numeric(prefs.elevenSimilarity, 0.75, 0, 1, "Similarity"),
      style: 0,
      speed: model === "eleven_v4" || model === "eleven_v3" ? 1 : numeric(prefs.elevenSpeed, 1, 0.7, 1.2, "Speed"),
    },
  };
}

export function elevenRequestBody(text: string, config: ElevenConfig) {
  return {
    text,
    model_id: config.model,
    ...(config.model === "eleven_multilingual_v2" ? {} : { language_code: config.language }),
    voice_settings: config.model === "eleven_v4"
      ? { stability: config.settings.stability, similarity_boost: config.settings.similarity_boost }
      : config.model === "eleven_v3"
        ? { stability: config.settings.stability }
        : config.settings,
    apply_text_normalization: "auto",
  };
}

/** Store bounded, redacted diagnostics, never raw remote response bodies. */
export async function requestElevenAudio(text: string, config: ElevenConfig): Promise<Buffer> {
  const attempted: string[] = [];
  const characters = characterCount(text);
  let lastError = "";
  // Redact every saved credential in case the remote service echoes one.
  const secrets = await updateKeys((state) => state.keys.map((key) => key.secret));
  while (true) {
    const key = await updateKeys((state) => reserveKey(state, attempted, characters));
    if (!key) {
      throw new Error(attempted.length
        ? `All attempted ElevenLabs keys failed. ${lastError}. Open Manage ElevenLabs Keys for details; reactivate after correcting settings.`
        : "No active ElevenLabs keys; open Manage ElevenLabs Keys → Reactivate Now after correcting settings");
    }
    attempted.push(key.id);
    let audio: Buffer;
    let safeError = "Network error or timeout";
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
        headers: { "xi-api-key": key.secret, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(elevenRequestBody(text, config)),
      });
      if (!response.ok) {
        safeError = await describeElevenError(response, [...secrets, text]);
        throw new Error(safeError);
      }
      const { readMp3Response } = await import("./audio-cache");
      safeError = "Invalid or empty MP3 response";
      audio = await readMp3Response(response);
    } catch {
      lastError = safeError;
      await updateKeys((state) => {
        const current = state.keys.find((item) => item.id === key.id && item.secret === key.secret);
        if (current) failKey(current, safeError);
      });
      continue;
    }
    await updateKeys((state) => {
      const current = state.keys.find((item) => item.id === key.id && item.secret === key.secret);
      if (current) current.successfulCharacters += characters;
    });
    return audio;
  }
}
