import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { book, randomVerb } from "./data";
import { EditMine } from "./edit-mine";
import { searchVerbs } from "./model";
import { loadMine, loadStats, randomOf } from "./mine";

export function PickVerb({
  onPick,
  initialQuery = "",
}: {
  onPick: (infinitive: string) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [mine, setMine] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | undefined>();
  const ready = useRef(false);
  const names = useMemo(() => (query.trim() ? searchVerbs(book, query) : book.common), [query]);

  useEffect(() => {
    void Promise.all([loadMine(), loadStats()]).then(([list, s]) => {
      setMine(list);
      setStats(s);
      setSelected(list[0] ? `mine-${list[0]}` : book.common[0] ? `common-${book.common[0]}` : undefined);
      ready.current = true;
    });
  }, []);

  function onSearch(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setSelected(mine.length ? `mine-${mine[0]}` : book.common[0] ? `common-${book.common[0]}` : undefined);
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
      searchBarPlaceholder="动词原形，如 aller、être、souvenir"
      searchText={query}
      onSearchTextChange={onSearch}
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (!ready.current) return;
        if (id) setSelected(id);
      }}
    >
      {!query.trim() && (
        <List.Section title={`我的 ${mine.length}`}>
          {mine.length > 0 ? (
            mine.map((name) => (
              <List.Item
                key={`mine-${name}`}
                id={`mine-${name}`}
                title={name}
                accessories={stats[name] ? [{ text: `${stats[name]} 次` }] : []}
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
      <List.Section title={query.trim() ? "匹配" : `常用 ${book.common.length}`}>
        {names.map((name) => (
          <List.Item
            key={query.trim() ? `match-${name}` : `common-${name}`}
            id={query.trim() ? `match-${name}` : `common-${name}`}
            title={name}
            actions={
              <ActionPanel>
                <Action title="打开" icon={Icon.Book} onAction={() => onPick(name)} />
                {extra}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {!names.length && <List.EmptyView title="词库里没有这个原形" />}
    </List>
  );
}
