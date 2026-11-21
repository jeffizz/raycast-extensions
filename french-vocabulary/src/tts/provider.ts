export function parseFrdicPercentage(raw?: string): number {
  const value = raw?.trim() ? Number(raw) : 100;
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw Error("Frdic probability must be between 0 and 100.");
  return value;
}
export function chooseProvider(
  percentage: number,
  random = Math.random,
): "frdic" | "elevenlabs" {
  return random() * 100 < percentage ? "frdic" : "elevenlabs";
}
