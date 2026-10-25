import { LocalStorage } from "@raycast/api";

const TRANSLATION_ENABLED_KEY = "translationEnabled";

export async function isTranslationEnabled(): Promise<boolean> {
  const value = await LocalStorage.getItem<string>(TRANSLATION_ENABLED_KEY);
  if (value === null || value === undefined) {
    return true;
  }

  return value === "1";
}

export async function toggleTranslationEnabled(): Promise<boolean> {
  const nextValue = !(await isTranslationEnabled());
  await LocalStorage.setItem(TRANSLATION_ENABLED_KEY, nextValue ? "1" : "0");
  return nextValue;
}
