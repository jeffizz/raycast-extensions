import { List } from "@raycast/api";
import { Word } from "../core/model";
import { statusIcon, statusTooltip } from "./status";

export function contentAccessories(
  word: Word,
  hasChat = false,
): List.Item.Accessory[] {
  const source = statusIcon(word, hasChat);
  return source ? [{ icon: { source }, tooltip: statusTooltip(word) }] : [];
}
