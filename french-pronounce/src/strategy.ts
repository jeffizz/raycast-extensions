import { LocalStorage } from "@raycast/api";
import { withStateLock } from "./state";

export const STRATEGIES = ["fallback", "frdic", "elevenlabs", "random"] as const;
export type SpeechStrategy = (typeof STRATEGIES)[number];
export const STRATEGY_LABELS: Record<SpeechStrategy, string> = {
  fallback: "frdic → ElevenLabs (fallback)",
  frdic: "frdic only",
  elevenlabs: "ElevenLabs only",
  random: "Random: Frdic / ElevenLabs",
};
const KEY = "speech-strategy-v1";

/** Percentage applies per pronunciation attempt, independently of cache hits. */
export function parseFrdicPercentage(raw?: string): number {
  const trimmed = raw?.trim();
  if (!trimmed) return 50;
  if (!/^(?:\d+)(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Random Frdic percentage must be a number from 0 to 100");
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Random Frdic percentage must be a number from 0 to 100");
  }
  return value;
}

export function chooseRandomProvider(frdicPercentage: number): "frdic" | "elevenlabs" {
  return Math.random() * 100 < frdicPercentage ? "frdic" : "elevenlabs";
}

export async function getStrategy(): Promise<SpeechStrategy> {
  const stored = await LocalStorage.getItem<string>(KEY);
  return STRATEGIES.includes(stored as SpeechStrategy) ? (stored as SpeechStrategy) : "fallback";
}

export async function setStrategy(strategy: SpeechStrategy): Promise<void> {
  await withStateLock(() => LocalStorage.setItem(KEY, strategy));
}

export async function cycleStrategy(): Promise<SpeechStrategy> {
  return withStateLock(async () => {
    const current = await getStrategy();
    const next = STRATEGIES[(STRATEGIES.indexOf(current) + 1) % STRATEGIES.length];
    await LocalStorage.setItem(KEY, next);
    return next;
  });
}
