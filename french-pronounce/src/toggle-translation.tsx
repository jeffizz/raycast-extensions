import { showHUD } from "@raycast/api";
import { toggleTranslationEnabled } from "./translation-toggle";

export default async function Command() {
  const enabled = await toggleTranslationEnabled();
  await showHUD(enabled ? "翻译已开" : "翻译已关");
}
