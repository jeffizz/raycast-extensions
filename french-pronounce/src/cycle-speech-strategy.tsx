import { showHUD } from "@raycast/api";
import { cycleStrategy, STRATEGY_LABELS } from "./strategy";

export default async function Command() {
  try {
    await showHUD(`Speech: ${STRATEGY_LABELS[await cycleStrategy()]}`);
  } catch (error) {
    await showHUD(error instanceof Error ? error.message : "Unable to switch strategy");
  }
}
