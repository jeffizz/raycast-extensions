import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { book, randomVerb } from "./data";
import { EditMine } from "./edit-mine";
import { searchVerbs } from "./model";
import { loadLookupHistory, loadMine, loadRecentPractices, loadStats, randomOf, type LookupHistoryEntry } from "./mine";
import { findVerbMatches, type MatchedCell, type VerbMatch } from "./lexik";

export function PickVerb({
  onPick,
  initialQuery = "",
  initialMatches = [],
  resolveInflected = false,
}: {
  onPick: (infinitive: string, matchedCells?: MatchedCell[]) => void;
  initialQuery?: string;
  initialMatches?: VerbMatch[];
  resolveInflected?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [mine, setMine] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [lookupHistory, setLookupHistory] = useState<LookupHistoryEntry[]>([]);
  const [practiceRecent, setPracticeRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [reverse, setReverse] = useState<{ query: string; matches: VerbMatch[] }>({ query: initialQuery, matches: initialMatches });
  const [searching, setSearching] = useState(false);
  const ready = useRef(false);
  const names = useMemo(() => (query.trim() ? searchVerbs(book, query) : book.common), [query]);

  useEffect(() => {
    void Promise.all([loadMine(), loadStats(), loadLookupHistory(), loadRecentPractices()]).then(([list, s, history, recent]) => {
      setMine(list);
      setStats(s);
      setLookupHistory(history);
      setPracticeRecent(recent);
      if (!initialQuery.trim()) {
        const first = resolveInflected ? history[0]?.name : recent[0];
        setSelected(first ? `recent-${first}` : list[0] ? `mine-${list[0]}` : book.common[0] ? `common-${book.common[0]}` : undefined);
      }
      ready.current = true;
    });
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!resolveInflected || !term) {
      setReverse({ query, matches: [] });
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void findVerbMatches(book, term).then((matches) => {
        if (!active) return;
        setReverse({ query, matches });
        if (matches.length && !searchVerbs(book, query).some((name) => name.toLowerCase() === term.toLowerCase())) {
          setSelected(`form-${matches[0].infinitive}`);
        }
      }).catch((error) => {
        console.error("LeXiK lookup failed", error);
        if (active) {
          setReverse({ query, matches: [] });
          void showToast({ style: Toast.Style.Failure, title: "动词词形库查询失败", message: "请检查 SQLite 词库是否存在" });
        }
      }).finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [query, resolveInflected]);

  const reverseMatches = reverse.query === query ? reverse.matches : [];
  const showInitial = !query.trim() || (!searching && (!resolveInflected || reverse.query === query) && !names.length && !reverseMatches.length);
  const recent = resolveInflected ? lookupHistory.map((entry) => entry.name) : practiceRecent;
  const counts = resolveInflected ? Object.fromEntries(lookupHistory.map((entry) => [entry.name, entry.count])) : stats;

  useEffect(() => {
    if (!showInitial || !query.trim()) return;
    const first = recent[0];
    setSelected(first ? `recent-${first}` : mine[0] ? `mine-${mine[0]}` : book.common[0] ? `common-${book.common[0]}` : undefined);
  }, [showInitial, query, recent.join("\u0000"), mine.join("\u0000")]);

  function onSearch(value: string) {
    setQuery(value);
    if (!value.trim()) {
      const first = resolveInflected ? lookupHistory[0]?.name : practiceRecent[0];
      setSelected(first ? `recent-${first}` : mine.length ? `mine-${mine[0]}` : book.common[0] ? `common-${book.common[0]}` : undefined);
      return;
    }
    const hits = searchVerbs(book, value);
    if (hits[0]) setSelected(`match-${hits[0]}`);
  }

  function openRandomMine() {
    if (!mine.length) {
      showToast({ style: Toast.Style.Failure, title: "我的动词还是空的", message: "先编辑一份列表" });
      return;
    }
    onPick(randomOf(mine));
  }

  const extra = (
    <>
      <Action title="随机我的" icon={Icon.Shuffle} onAction={openRandomMine} />
      <Action title="随机常用" icon={Icon.Shuffle} onAction={() => onPick(randomVerb("common"))} />
      <Action title="随机全部" icon={Icon.Shuffle} onAction={() => onPick(randomVerb("all"))} />
      <Action.Push title="编辑我的动词" icon={Icon.Pencil} target={<EditMine onSaved={() => void loadMine().then(setMine)} />} />
    </>
  );

  return (
    <List
      filtering={false}
      throttle
      searchBarPlaceholder={resolveInflected ? "动词原形或变位形式，如 pouvoir、peut" : "动词原形，如 aller、être、souvenir"}
      isLoading={searching}
      searchText={query}
      onSearchTextChange={onSearch}
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (!ready.current) return;
        if (id) setSelected(id);
      }}
    >
      {showInitial && recent.length > 0 && (
        <List.Section title={resolveInflected ? "最近查询" : "最近练习"}>
          {recent.map((name) => (
            <List.Item
              key={`recent-${name}`}
              id={`recent-${name}`}
              title={name}
              accessories={[{ text: `${counts[name] ?? 0} 次` }]}
              actions={<ActionPanel><Action title="打开" icon={Icon.Book} onAction={() => onPick(name)} />{extra}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}
      {showInitial && (
        <List.Section title={`我的 ${mine.length}`}>
          {mine.length > 0 ? (
            mine.map((name) => (
              <List.Item
                key={`mine-${name}`}
                id={`mine-${name}`}
                title={name}
                accessories={counts[name] ? [{ text: `${counts[name]} 次` }] : []}
                actions={
                  <ActionPanel>
                    <Action title="打开" icon={Icon.Book} onAction={() => onPick(name)} />
                    {extra}
                  </ActionPanel>
                }
              />
            ))
          ) : (
            <List.Item
              id="mine-empty"
              title="还没有自定义动词"
              accessories={[{ text: "编辑我的动词" }]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="编辑我的动词"
                    icon={Icon.Pencil}
                    target={<EditMine onSaved={() => void loadMine().then(setMine)} />}
                  />
                </ActionPanel>
              }
            />
          )}
        </List.Section>
      )}
      {query.trim() && reverseMatches.length > 0 && (
        <List.Section title="变位形式匹配">
          {reverseMatches.map((match) => (
            <List.Item
              key={`form-${match.infinitive}`}
              id={`form-${match.infinitive}`}
              title={match.infinitive}
              subtitle={`词形：${query.trim()}`}
              actions={
                <ActionPanel>
                  <Action title="打开变位表" icon={Icon.Book} onAction={() => onPick(match.infinitive, match.matchedCells)} />
                  {extra}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      <List.Section title={showInitial ? `常用 ${book.common.length}` : "匹配"}>
        {(showInitial ? book.common : names).map((name) => (
          <List.Item
            key={showInitial ? `common-${name}` : `match-${name}`}
            id={showInitial ? `common-${name}` : `match-${name}`}
            title={name}
            accessories={counts[name] ? [{ text: `${counts[name]} 次` }] : []}
            actions={
              <ActionPanel>
                <Action title="打开" icon={Icon.Book} onAction={() => onPick(name)} />
                {extra}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
