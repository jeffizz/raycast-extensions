export const defaultIndicatorColors = Object.freeze({
  examples: "#52a8ff",
  family: "#a78bfa",
  collocations: "#29b8a5",
  mnemonic: "#ed9854",
  multiple: "#e879bd",
  chat: "#86868b",
});
export type IndicatorColors = {
  -readonly [K in keyof typeof defaultIndicatorColors]: string;
};
export const indicatorLabels: Record<keyof IndicatorColors, string> = {
  examples: "Examples",
  family: "Word Family",
  collocations: "Collocations",
  mnemonic: "Mnemonic",
  multiple: "Multiple Content Types",
  chat: "Word Chat History",
};
export const indicatorKeys = Object.keys(
  defaultIndicatorColors,
) as (keyof IndicatorColors)[];
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
  return result;
}
let current: IndicatorColors = { ...defaultIndicatorColors };
export function indicatorColors(): Readonly<IndicatorColors> {
  return current;
}
export function applyIndicatorColors(value: unknown) {
  current = parseIndicatorColors(value);
}
