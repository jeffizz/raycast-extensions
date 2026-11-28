export const diamondRoundnessOptions = {
  subtle: "Subtle",
  medium: "Medium",
  soft: "Soft",
} as const;
export type DiamondRoundness = keyof typeof diamondRoundnessOptions;

const colourDefaults = {
  examples: "#52a8ff",
  family: "#a78bfa",
  collocations: "#29b8a5",
  mnemonic: "#ed9854",
  multiple: "#e879bd",
  chat: "#86868b",
};
export const defaultIndicatorColors = Object.freeze({
  ...colourDefaults,
  diamondRoundness: "medium" as DiamondRoundness,
});
export type IndicatorColourKey = keyof typeof colourDefaults;
export type IndicatorColors = {
  [K in IndicatorColourKey]: string;
} & { diamondRoundness: DiamondRoundness };
export const indicatorLabels: Record<IndicatorColourKey, string> = {
  examples: "Examples",
  family: "Word Family",
  collocations: "Collocations",
  mnemonic: "Mnemonic",
  multiple: "Multiple Content Types",
  chat: "Word Chat History",
};
export const indicatorKeys = Object.keys(
  colourDefaults,
) as IndicatorColourKey[];
export function parseIndicatorColors(value: unknown): IndicatorColors {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid indicator colours.");
  const result = { ...defaultIndicatorColors } as IndicatorColors;
  for (const key of indicatorKeys) {
    // Older palettes predate the chat indicator.
    if (key === "chat" && !Object.hasOwn(value, key)) continue;
    const color = (value as Record<string, unknown>)[key];
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color.trim()))
      throw Error(
        indicatorLabels[key] + ": enter a HEX colour such as #52A8FF.",
      );
    result[key] = color.trim().toLowerCase();
  }
  const roundness = (value as Record<string, unknown>).diamondRoundness;
  if (roundness === "subtle" || roundness === "medium" || roundness === "soft")
    result.diamondRoundness = roundness;
  return result;
}
let current: IndicatorColors = { ...defaultIndicatorColors };
export function indicatorColors(): Readonly<IndicatorColors> {
  return current;
}
export function applyIndicatorColors(value: unknown) {
  current = parseIndicatorColors(value);
}
