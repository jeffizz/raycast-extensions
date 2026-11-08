import { environment, getSelectedText, showHUD } from "@raycast/api";
import { cleanNounInput, linkedNouns, lookupNoun, speechPlanForSelection, stripArticle } from "./nouns/lexicon";
import { playFrenchSpeechItems } from "./tts";

export default async function Command() {
  let text: string;
  try {
    text = (await getSelectedText()).trim();
  } catch {
    await showHUD("请先选中一个法语名词");
    return;
  }
  const cleaned = cleanNounInput(text);
  if (cleaned === null) {
    await showHUD("括号不匹配，请重新选择名词");
    return;
  }
  text = cleaned;
  const term = stripArticle(text);
  if (!term || term.length > 60 || !/^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$/u.test(term)) {
    await showHUD("请选中单个法语名词或冠词搭配");
    return;
  }
  try {
    const matches = await lookupNoun(environment.assetsPath, text);
    if (!matches.length) {
      await showHUD("离线词库未找到该名词");
      return;
    }
    const related = await linkedNouns(environment.assetsPath, matches);
    const { phrases, ambiguous } = speechPlanForSelection(matches, text, related);
    if (!phrases.length) {
      await showHUD("没有可靠的单数不定冠词搭配，请使用名词查询");
      return;
    }
    await showHUD(phrases.join(" / ") + (ambiguous ? "（有歧义）" : ""));
    await playFrenchSpeechItems(phrases);
  } catch (error) {
    await showHUD(`朗读失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
