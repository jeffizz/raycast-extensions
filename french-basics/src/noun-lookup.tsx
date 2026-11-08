import { useEffect, useMemo, useRef, useState } from "react";
import { Action, ActionPanel, Clipboard, environment, getPreferenceValues, getSelectedText, Icon, List, LocalStorage, showToast, Toast } from "@raycast/api";
import { playFrenchSpeech } from "./tts";
import { cachedNounTranslations, DeepLPlan } from "./nouns/deepl";
import { articlePhrases, cleanNounInput, linkedNouns, lookupNoun, normalize, preferredPhrase, stripArticle, translationForPhrase, translationInputs, NounEntry, NounMatch } from "./nouns/lexicon";

type Preferences = { deepLApiKey?: string; deepLApiPlan?: DeepLPlan };

function genderLabel(entry: NounEntry): string {
  return entry.gender.map((gender) => gender === "m" ? "n.m." : "n.f.").join(" / ") || "n. 性别待确认";
}

function validateInput(input: string): boolean {
  const stripped = stripArticle(input);
  return stripped.length > 0 && stripped.length <= 60 && /^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$/u.test(stripped);
}

export default function Command() {
  const [matches, setMatches] = useState<NounMatch[]>([]);
  const [related, setRelated] = useState<NounEntry[]>([]);
  const [databaseError, setDatabaseError] = useState("");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [source, setSource] = useState("手动输入");
  const [loadingInput, setLoadingInput] = useState(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationError, setTranslationError] = useState("");
  const [translating, setTranslating] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasEdited = useRef(false);
  const preferences = getPreferenceValues<Preferences>();

  useEffect(() => {
    let active = true;
    async function readInput() {
      let text: string | undefined;
      let origin = "手动输入";
      try {
        text = await getSelectedText();
        if (text?.trim()) origin = "选中文本";
      } catch {
        // The frontmost app does not expose a selection; try the clipboard.
      }
      if (!text?.trim()) {
        try {
          text = await Clipboard.readText();
          if (text?.trim()) origin = "剪贴板";
        } catch {
          // Manual input remains available.
        }
      }
      if (active) {
        if (!hasEdited.current && text?.trim()) {
          setQuery(cleanNounInput(text) ?? text.trim());
          setSource(origin);
        }
        setLoadingInput(false);
      }
    }
    void readInput();
    return () => { active = false; };
  }, []);

  const cleanQuery = cleanNounInput(query);
  const validInput = cleanQuery !== null && validateInput(cleanQuery);
  useEffect(() => {
    let active = true;
    setMatches([]);
    setRelated([]);
    setDatabaseError("");
    if (!validInput) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await lookupNoun(environment.assetsPath, cleanQuery!);
        const counterparts = await linkedNouns(environment.assetsPath, found);
        if (active) { setMatches(found); setRelated(counterparts); }
      } catch (error) {
        if (active) setDatabaseError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setSearching(false);
      }
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [cleanQuery, validInput]);
  useEffect(() => {
    const selected = preferredPhrase(matches, cleanQuery ?? "");
    setSelectedItemId(selected ? `match-${selected.entry.id}-${selected.index}` : undefined);
  }, [cleanQuery, matches]);
  const translationTexts = useMemo(() => [...new Set([...matches.map((m) => m.entry), ...related].flatMap(translationInputs))], [matches, related]);
  const translationKey = JSON.stringify(translationTexts);
  const apiKey = preferences.deepLApiKey?.trim();
  const plan = preferences.deepLApiPlan ?? "free";

  useEffect(() => {
    setTranslations({});
    setTranslationError("");
    if (!translationTexts.length) {
      setTranslating(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setTranslating(true);
      try {
        const result = await cachedNounTranslations(translationTexts, apiKey, plan, {
          getItem: (key) => LocalStorage.getItem<string>(key),
          setItem: (key, value) => LocalStorage.setItem(key, value),
        }, controller.signal);
        if (active) setTranslations(result);
      } catch (error) {
        if (active && !controller.signal.aborted) setTranslationError(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) setTranslating(false);
      }
    }, 400);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
    // translationKey represents the stable ordered list, avoiding refetches on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationKey, apiKey, plan, retry]);

  async function play(text: string) {
    try {
      await playFrenchSpeech(text);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "朗读失败", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function renderEntry(entry: NounEntry, relatedEntry: boolean) {
    const phrases = articlePhrases(entry);
    const translation = translationInputs(entry).map((text) => translations[text]).filter(Boolean).join(" / ");
    const note = [
      entry.inferredLink ? "推断关联" : relatedEntry ? "阴阳变体" : "词典匹配",
      !relatedEntry && matches.find((match) => match.entry.id === entry.id)?.matchedNumbers.join("/") ? `输入词形：${matches.find((match) => match.entry.id === entry.id)!.matchedNumbers.map((n) => n === "s" ? "单数" : "复数").join("/")}` : "",
      !relatedEntry && new Set(matches.map((match) => match.entry.lemma)).size > 1 ? "同形异词，非阴阳变体" : "",
      "词义/可数性依语境",
      entry.onset === "aspirated-h" ? "H aspiré：不省音、不连音" : entry.onset === "mute-h" ? "H muet：可省音、连音" : "",
      entry.onset === "unknown" ? "词首发音未确认：定冠词待确认" : "",
      entry.gender.length > 1 ? "双性别 · 词义待确认" : "",
      ["amour", "délice"].includes(normalize(entry.lemma)) ? "性数用法待确认" : "",
      translation ? `DeepL：${translation}` : "",
    ].filter(Boolean).join(" · ");
    return (
      <List.Section key={`${relatedEntry ? "related" : "match"}-${entry.id}`} title={`${entry.lemma}  ${genderLabel(entry)}${entry.inferredLink ? " · 推断关联" : relatedEntry ? " · 关联变体" : ""}`} subtitle={note}>
        {phrases.length ? phrases.map((phrase, index) => (
          <List.Item
            key={`${entry.id}-${phrase.text}-${index}`}
            id={`${relatedEntry ? "related" : "match"}-${entry.id}-${index}`}
            title={phrase.text}
            subtitle={phrase.description}
            accessories={translationForPhrase(entry, phrase, translations) ? [{ text: translationForPhrase(entry, phrase, translations), tooltip: "DeepL（仅供参考）" }] : []}
            actions={
              <ActionPanel>
                <Action title="朗读冠词搭配" icon={Icon.SpeakerHigh} onAction={() => play(phrase.text)} />
                <Action.CopyToClipboard title="复制冠词搭配" content={phrase.text} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                <Action title="重新尝试 DeepL 翻译" icon={Icon.ArrowClockwise} onAction={() => setRetry((value) => value + 1)} shortcut={{ modifiers: ["cmd", "shift"], key: "r" }} />
              </ActionPanel>
            }
          />
        )) : <List.Item title={`${entry.lemma} · 冠词待确认`} subtitle="词库没有可靠的单复数词形" icon={Icon.ExclamationMark} />}
      </List.Section>
    );
  }

  const sourceTitle = query ? `来源：${source}` : "输入法语名词";
  return (
    <List
      searchText={query}
      onSearchTextChange={(value) => { hasEdited.current = true; setSource("手动输入"); setQuery(value); }}
      searchBarPlaceholder="输入名词，或启动前选中 / 复制法语名词"
      navigationTitle={`法语名词查询 · ${sourceTitle}`}
      isLoading={loadingInput || searching || translating}
      filtering={false}
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => setSelectedItemId(id ?? undefined)}
    >
      {databaseError ? (
        <List.EmptyView title="无法查询离线名词库" description={databaseError} />
      ) : !query ? (
        <List.EmptyView title="输入法语名词" description="选中或复制名词后重新打开命令，也可直接输入。" />
      ) : !validInput ? (
        <List.EmptyView title="请输入单个名词" description="请输入单个名词，括号需成对；不支持的输入不会发送到 DeepL。" />
      ) : searching ? (
        <List.EmptyView title="正在查询词库…" />
      ) : !matches.length ? (
        <List.EmptyView title="离线名词库未找到" description="请检查拼写、重音，或尝试名词原形；本词库包含 LeXiK 名词条目。" />
      ) : (
        <>
          {translationError && <List.Section title="中文翻译不可用"><List.Item title="DeepL 翻译失败" subtitle={translationError} icon={Icon.ExclamationMark} actions={<ActionPanel><Action title="重试" onAction={() => setRetry((value) => value + 1)} /></ActionPanel>} /></List.Section>}
          {matches.map(({ entry }) => renderEntry(entry, false))}
          {related.map((entry) => renderEntry(entry, true))}
        </>
      )}
    </List>
  );
}
