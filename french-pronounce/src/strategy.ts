import { LocalStorage } from "@raycast/api";
import { withStateLock } from "./state";

export const STRATEGIES = ["fallback", "frdic", "elevenlabs"] as const;
export type SpeechStrategy = (typeof STRATEGIES)[number];
export const STRATEGY_LABELS: Record<SpeechStrategy, string> = {
  fallback: "frdic → ElevenLabs (fallback)",
  frdic: "frdic only",
  elevenlabs: "ElevenLabs only",
};
const KEY = "speech-strategy-v1";

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
