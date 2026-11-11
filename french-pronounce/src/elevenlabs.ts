import { getPreferences, type Preferences } from "./preferences";
import type { Language } from "./speech";
import { updateKeys } from "./state";
import { failKey, reserveKey } from "./key-state";
import { characterCount } from "./text-safety";
import { describeElevenError } from "./elevenlabs-errors";

export const DEFAULT_VOICES = { fr: "FvmvwvObRqIHojkEGh5N", en: "bGnz83yTAb7caZSC7BBz" } as const;
const LEGACY_MODELS = ["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"] as const;
const V4_MODELS = ["eleven_v4", "eleven_v4_turbo"] as const;

/** Commas or newlines separate IDs. Empty entries are ignored and duplicates removed. */
export function parseVoiceIds(raw: string | undefined, language: Language): string[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return [DEFAULT_VOICES[language]];
  const ids = [...new Set(trimmed.split(/[,，\r\n]+/).map((item) => item.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
    throw new Error(`Invalid ElevenLabs ${language === "fr" ? "French" : "English"} Voice ID list; separate IDs with commas or newlines`);
  }
  return ids;
}

export function chooseVoiceId(ids: string[]): string {
  return ids.length === 1 ? ids[0] : ids[Math.floor(Math.random() * ids.length)];
}

export interface ElevenSynthesisConfig {
  model: string;
  language: Language;
  settings: { stability: number; similarity_boost: number; style: number; speed: number };
}

export interface ElevenConfig extends ElevenSynthesisConfig {
  voiceId: string;
}

function numeric(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return number;
}

export function getElevenSynthesisConfig(language: Language, prefs: Preferences = getPreferences()): ElevenSynthesisConfig {
  const model = prefs.elevenModel?.trim() || "eleven_v4";
  // Validate syntax, not a fixed allowlist: future model IDs remain usable.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(model)) {
    throw new Error("Invalid ElevenLabs model ID. Enter a model ID such as eleven_v4 (letters, digits, underscores, dots or hyphens)");
  }
  const isV4 = (V4_MODELS as readonly string[]).includes(model);
  const isLegacy = (LEGACY_MODELS as readonly string[]).includes(model);
  return {
    language,
    model,
    settings: {
      // v3 only accepts discrete stability values. Map legacy/custom values to the nearest supported mode.
      stability: model === "eleven_v3"
        ? Math.round(numeric(prefs.elevenStability, 0.5, 0, 1, "Stability") * 2) / 2
        : isV4 || isLegacy ? numeric(prefs.elevenStability, 0.65, 0, 1, "Stability") : 0.65,
      similarity_boost: isV4 || isLegacy ? numeric(prefs.elevenSimilarity, 0.75, 0, 1, "Similarity") : 0.75,
      style: 0,
      speed: isLegacy ? numeric(prefs.elevenSpeed, 1, 0.7, 1.2, "Speed") : 1,
    },
  };
}

export function getElevenConfig(language: Language, prefs: Preferences = getPreferences()): ElevenConfig {
  const synthesis = getElevenSynthesisConfig(language, prefs);
  const voiceId = chooseVoiceId(parseVoiceIds(language === "fr" ? prefs.elevenFrenchVoiceId : prefs.elevenEnglishVoiceId, language));
  return { ...synthesis, voiceId };
}

export function elevenRequestBody(text: string, config: ElevenSynthesisConfig) {
  const v4 = (V4_MODELS as readonly string[]).includes(config.model);
  const legacy = (LEGACY_MODELS as readonly string[]).includes(config.model);
  const known = v4 || legacy || config.model === "eleven_v3";
  // Unknown future models receive only the required fields: optional settings and
  // language compatibility cannot be assumed. ElevenLabs validates the model ID.
  if (!known) return { text, model_id: config.model };
  return {
    text,
    model_id: config.model,
    ...(config.model === "eleven_multilingual_v2" ? {} : { language_code: config.language }),
    voice_settings: v4
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
