import { List } from "@raycast/api";
import { Word } from "../core/model";
import { statusIcon, statusTooltip } from "./status";

export function contentAccessories(word: Word): List.Item.Accessory[] {
  const source = statusIcon(word);
  return source ? [{ icon: { source }, tooltip: statusTooltip(word) }] : [];
}
