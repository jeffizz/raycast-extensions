import { LocalStorage } from "@raycast/api";
import {
  IndicatorColors,
  applyIndicatorColors,
  defaultIndicatorColors,
  parseIndicatorColors,
} from "../core/indicator-colors";
const key = "content-indicator-colors-v1";
export async function loadIndicatorColors() {
  const raw = await LocalStorage.getItem<string>(key);
  let colors: IndicatorColors = { ...defaultIndicatorColors };
  if (raw) {
    try {
      colors = parseIndicatorColors(JSON.parse(raw));
    } catch {
      /* Invalid local settings fall back without touching vocabulary. */
    }
  }
  applyIndicatorColors(colors);
  return colors;
}
export async function saveIndicatorColors(value: unknown) {
  const colors = parseIndicatorColors(value);
  await LocalStorage.setItem(key, JSON.stringify(colors));
  applyIndicatorColors(colors);
}
