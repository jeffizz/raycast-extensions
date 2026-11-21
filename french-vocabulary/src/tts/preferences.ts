import { getPreferenceValues } from "@raycast/api";
export interface Preferences {
  elevenFrenchVoiceId?: string;
  elevenEnglishVoiceId?: string;
  elevenModel?: string;
  elevenSpeed?: string;
  elevenStability?: string;
  elevenSimilarity?: string;
  randomFrdicPercentage?: string;
}
export const getPreferences = () => getPreferenceValues<Preferences>();
export { parseFrdicPercentage, chooseProvider } from "./provider";
