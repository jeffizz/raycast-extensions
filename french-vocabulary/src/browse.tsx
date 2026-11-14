import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isNoun, Word, setPractice } from "./core/model";
import {
  sortModes,
  sortWords,
  matchesSearch,
  recentMistakes,
} from "./core/presentation";
import { autoBackup, preferences, report, store, useLibrary } from "./runtime";
import { stopSpeech } from "./speech";
import { AddToGroup, WordActions, wordMarkdown } from "./components/word";
import ImportVocabulary from "./import-vocabulary";
import { statusIcon } from "./components/status";
export type Filters = { pos: string; familiarity: string; practice: string };
const defaults: Filters = { pos: "all", familiarity: "all", practice: "all" };
export default function Browse() {
  return <VocabularyList />;
}
export function VocabularyList({ archived = false }: { archived?: boolean }) {
  const { lib, loading, refresh } = useLibrary(),
    { push, pop } = useNavigation();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(defaults),
    [sort, setSort] = useState("activity"),
    [marked, setMarked] = useState<string[]>([]),
    [selection, setSelection] = useState<string>(),
    [showIPA, setShowIPA] = useState(false),
    [shuffle, setShuffle] = useState(0),
    [visibleCount, setVisibleCount] = useState(80),
    [recentErrors, setRecentErrors] = useState(false);
  const random = useRef(new Map<string, number>());
  const viewQueue = useRef(Promise.resolve());
  const seen = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      stopSpeech();
    },
    [],
  );
  // Persist activity after a short dwell, without reordering the list under the cursor.
  useEffect(() => {
    if (!selection || seen.current === selection) return;
    const timer = setTimeout(() => {
      seen.current = selection;
      viewQueue.current = viewQueue.current
        .then(() => store.touchWord(selection))
        .then(() => { void autoBackup(); })
        .catch(report);
    }, 450);
    return () => clearTimeout(timer);
  }, [selection]);
  const safeRefresh = useCallback(async () => {
    await viewQueue.current;
    await refresh();
  }, [refresh]);
  const words = useMemo(() => {
    for (const w of lib.words)
      if (!random.current.has(w.id)) random.current.set(w.id, Math.random());
    const recentIds = recentErrors ? recentMistakes(lib) : [];
    const recent = new Set(recentIds);
    const result = sortWords(
      lib.words.filter(
        (w) =>
          w.archived === archived &&
          (!recentErrors || recent.has(w.id)) &&
          (filter.familiarity === "all" ||
            (filter.familiarity === "fuzzy"
              ? w.familiarity === "fuzzy" || w.familiarity === "unknown"
              : w.familiarity === filter.familiarity)) &&
          (filter.practice === "all" ||
            w.practice === (filter.practice === "included")) &&
          (filter.pos === "all" ||
            w.senses.some((s) =>
              filter.pos === "noun"
                ? isNoun(s.pos)
                : filter.pos === "verb"
                  ? /^v\./i.test(s.pos)
                  : filter.pos === "adjective"
                    ? /adj\./i.test(s.pos)
                    : /adv\./i.test(s.pos),
            )) &&
          matchesSearch(w, query),
      ),
      lib,
      sort,
      random.current,
    );
    const ranks = new Map(recentIds.map((id, index) => [id, index]));
    return recentErrors
      ? result.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!)
      : result;
  }, [lib, filter, query, sort, archived, shuffle, recentErrors]);
  const batch = async (kind: "add" | "remove" | "archive", ids = marked) => {
    try {
      await viewQueue.current;
      const set = new Set(ids);
      await store.mutate((l) => {
        for (const w of l.words)
          if (set.has(w.id)) {
            if (kind === "archive") w.archived = !archived;
            else setPractice(w, kind === "add");
            w.updatedAt = new Date().toISOString();
          }
      });
      setMarked([]);
      await safeRefresh();
      await autoBackup();
    } catch (e) {
      await report(e);
    }
  };
  const mark = (id: string) =>
    setMarked((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const batchForm = () =>
    push(
      <BatchPicker
        words={words}
        initial={marked}
        onSave={async (ids) => {
          await batch("add", ids);
          pop();
        }}
      />,
    );
  const markedSet = useMemo(() => new Set(marked), [marked]);
  const activeId = selection ?? words[0]?.id;
  const visibleWords = words.slice(0, visibleCount);
  useEffect(() => {
    setVisibleCount(80);
  }, [query, filter, sort, recentErrors]);
  const accessories = (w: Word): List.Item.Accessory[] => {
    const source = statusIcon(w),
      pos = preferences().listPOS;
    return [
      ...(pos === "right" ? [{ text: w.senses[0]?.pos ?? "" }] : []),
      ...(source
        ? [
            {
              icon: { source },
              tooltip: [
                w.practice ? "In practice" : "",
                w.familiarity === "known"
                  ? "Know"
                  : w.familiarity === "fuzzy" || w.familiarity === "unknown"
                    ? "Fuzzy"
                    : "",
              ]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : []),
    ];
  };
  return (
    <List
      isLoading={loading}
      isShowingDetail
      pagination={{
        pageSize: 80,
        hasMore: visibleCount < words.length,
        onLoadMore: () => setVisibleCount((n) => n + 80),
      }}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      selectedItemId={selection}
      onSelectionChange={(id) => {
        setSelection(id ?? undefined);
        stopSpeech();
      }}
      navigationTitle={archived ? "Archived Vocabulary" : "French Vocabulary"}
      searchBarPlaceholder="Search vocabulary…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Browse Order / Recent Mistakes"
          value={recentErrors ? "recent-errors" : sort}
          onChange={(value) => {
            setRecentErrors(value === "recent-errors");
            if (value !== "recent-errors") setSort(value);
          }}
        >
          <List.Dropdown.Item
            value="recent-errors"
            title="Recent Mistakes (7 Days)"
          />
          {sortModes.map(([value, title]) => (
            <List.Dropdown.Item key={value} value={value} title={title} />
          ))}
        </List.Dropdown>
      }
      actions={
        <ActionPanel>
          <Action
            title="Import Vocabulary"
            onAction={() => push(<ImportVocabulary onImported={safeRefresh} />)}
          />
          <Action
            title={recentErrors ? "Show All Words" : "Recent Mistakes (7 Days)"}
            onAction={() => setRecentErrors((x) => !x)}
          />
          <Action
            title="Filters"
            onAction={() =>
              push(<FilterForm initial={filter} onSave={setFilter} />)
            }
          />
        </ActionPanel>
      }
    >
      <List.EmptyView title="No matching vocabulary" />
      <List.Section
        title={`${words.length}${marked.length ? ` · ${marked.length} selected` : ""}`}
      >
        {visibleWords.map((w) => (
          <List.Item
            key={w.id}
            id={w.id}
            title={w.word}
            subtitle={
              preferences().listPOS === "below" ? w.senses[0]?.pos : undefined
            }
            icon={
              markedSet.has(w.id)
                ? { source: Icon.CheckCircle, tintColor: Color.Blue }
                : undefined
            }
            accessories={accessories(w)}
            detail={
              w.id === activeId ? (
                <List.Item.Detail
                  markdown={wordMarkdown(w, undefined, showIPA)}
                />
              ) : undefined
            }
            actions={
              w.id === activeId ? (
                <ActionPanel>
                  {marked.length > 0 && (
                    <Action
                      title={`Add ${marked.length} Selected Words to Practice`}
                      icon={Icon.Bolt}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => batch("add")}
                    />
                  )}
                  <WordActions
                    word={w}
                    refresh={safeRefresh}
                    practiceShortcut={marked.length === 0}
                  />
                  <ActionPanel.Section title="Selection">
                    <Action
                      title={
                        markedSet.has(w.id) ? "Deselect Word" : "Select Word"
                      }
                      shortcut={{ modifiers: ["cmd"], key: "x" }}
                      onAction={() => mark(w.id)}
                    />
                    <Action
                      title="Select All Filtered Words"
                      shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
                      onAction={() => setMarked(words.map((w) => w.id))}
                    />
                    <Action
                      title="Add Selection to Practice"
                      icon={Icon.CheckList}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
                      onAction={batchForm}
                    />
                    {marked.length > 0 && (
                      <>
                        <Action
                          title="Add Selection to Confusion Group"
                          shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
                          onAction={() => push(<AddToGroup ids={marked} />)}
                        />
                        <Action
                          title="Remove Selection from Practice"
                          onAction={() => batch("remove")}
                        />
                        <Action
                          title={
                            archived ? "Restore Selection" : "Archive Selection"
                          }
                          onAction={() => batch("archive")}
                        />
                        <Action
                          title="Clear Selection"
                          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                          onAction={() => setMarked([])}
                        />
                      </>
                    )}
                  </ActionPanel.Section>
                  <Action
                    title={
                      recentErrors
                        ? "Show All Words"
                        : "Recent Mistakes (7 Days)"
                    }
                    icon={Icon.ExclamationMark}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                    onAction={() => setRecentErrors((x) => !x)}
                  />
                  <Action
                    title="Filters"
                    icon={Icon.Filter}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                    onAction={() =>
                      push(<FilterForm initial={filter} onSave={setFilter} />)
                    }
                  />
                  <Action
                    title={showIPA ? "Hide IPA" : "Show IPA"}
                    onAction={() => setShowIPA((x) => !x)}
                  />
                  {sort === "random" && (
                    <Action
                      title="Shuffle Again"
                      onAction={() => {
                        random.current = new Map(
                          lib.words.map((w) => [w.id, Math.random()]),
                        );
                        setShuffle((x) => x + 1);
                      }}
                    />
                  )}
                  <Action
                    title="Import Vocabulary"
                    onAction={() =>
                      push(<ImportVocabulary onImported={safeRefresh} />)
                    }
                  />
                  <Action
                    title="Refresh"
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={safeRefresh}
                  />
                </ActionPanel>
              ) : undefined
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
function BatchPicker({
  words,
  initial,
  onSave,
}: {
  words: Word[];
  initial: string[];
  onSave: (ids: string[]) => Promise<void>;
}) {
  return (
    <Form
      navigationTitle="Add Selection to Practice"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Selected Words"
            onSubmit={(v: { ids: string[] }) => onSave(v.ids)}
          />
        </ActionPanel>
      }
    >
      <Form.TagPicker id="ids" title="Words" defaultValue={initial}>
        {words.map((w) => (
          <Form.TagPicker.Item key={w.id} value={w.id} title={w.word} />
        ))}
      </Form.TagPicker>
    </Form>
  );
}
function FilterForm({
  initial,
  onSave,
}: {
  initial: Filters;
  onSave: (v: Filters) => void;
}) {
  const { pop } = useNavigation();
  const options: Record<keyof Filters, string[][]> = {
    pos: [
      ["all", "All"],
      ["noun", "Nouns"],
      ["verb", "Verbs"],
      ["adjective", "Adjectives"],
      ["adverb", "Adverbs"],
    ],
    familiarity: [
      ["all", "All"],
      ["unmarked", "No Status"],
      ["fuzzy", "Fuzzy"],
      ["known", "Know"],
    ],
    practice: [
      ["all", "All"],
      ["included", "In Practice"],
      ["excluded", "Not in Practice"],
    ],
  };
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply Filters"
            onSubmit={(v: Filters) => {
              onSave(v);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      {(Object.keys(options) as (keyof Filters)[]).map((k) => (
        <Form.Dropdown key={k} id={k} title={k} defaultValue={initial[k]}>
          {options[k].map(([value, title]) => (
            <Form.Dropdown.Item key={value} value={value} title={title} />
          ))}
        </Form.Dropdown>
      ))}
    </Form>
  );
}
