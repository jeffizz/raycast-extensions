import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  useNavigation,
  Keyboard,
  showToast,
  Toast,
} from "@raycast/api";
import { CollectionPicker, ManageCollections } from "./components/collections";
import { collections, changeCollectionMembers } from "./core/collections";
import { useLocalStorage } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchesWordFilters } from "./core/vocabulary-filters";
import { Word, setPractice, Library } from "./core/model";
import {
  sortModes,
  sortWords,
  matchesSearch,
  recentMistakes,
  detailMarkdown,
  sessionTranslationLanguage,
  translationValues,
} from "./core/presentation";
import { autoBackup, preferences, report, store, useLibrary } from "./runtime";
import { speakWord, stopSpeech } from "./speech";
import { AddToGroup, WordActions } from "./components/word";
import ImportVocabulary from "./import-vocabulary";
import { PracticeSession } from "./practice";
import { copyQuestionsInOrder } from "./core/learning";
import { modeSettings } from "./core/practice-settings";
import { statusIcon } from "./components/status";
import { addModeWords, practiceModes } from "./core/practice-settings";
import {
  ProcessingSession,
  startProcessing,
  processingWords,
  finishProcessingWord,
} from "./core/processing";
import {
  RangeStart,
  startSelectionRange,
  selectWordRange,
  setSelectionFamiliarity,
} from "./core/browse-selection";
export type Filters = { pos: string; familiarity: string; practice: string };
const defaults: Filters = { pos: "all", familiarity: "all", practice: "all" };
export default function Browse() {
  return <VocabularyList />;
}
export function VocabularyList({ archived = false }: { archived?: boolean }) {
  const { lib, loading, refresh } = useLibrary(),
    { push, pop } = useNavigation();
  const {
    value: listLayout = false,
    setValue: setListLayout,
    isLoading: layoutLoading,
  } = useLocalStorage<boolean>("browse-list-layout", false);
  const layoutAction = (
    <Action
      title={listLayout ? "Use Detail Layout" : "Use List Layout"}
      onAction={async () => {
        try {
          await setListLayout(!listLayout);
        } catch (error) {
          await report(error);
        }
      }}
    />
  );
  const [collectionId, setCollectionId] = useState("");
  const selectedCollection = collections(lib).find(
    (c) => c.id === collectionId,
  );
  useEffect(() => {
    if (!loading && collectionId && !selectedCollection) {
      setCollectionId("");
      setProcessing(false);
      setMarked([]);
    }
  }, [loading, collectionId, selectedCollection]);
  const collectionActions = () => (
    <ActionPanel.Section title="Collections">
      <Action
        title={`Collection: ${selectedCollection?.name ?? "All Words"}`}
        onAction={() =>
          push(
            <CollectionPicker
              selected={collectionId}
              onSelect={async (id) => {
                await safeRefresh();
                setCollectionId(id);
                setProcessing(false);
                setMarked([]);
                setSelection(undefined);
              }}
            />,
          )
        }
      />
      <Action
        title="Manage Collections"
        onAction={() => push(<ManageCollections onChanged={safeRefresh} />)}
      />
      <Action
        title={
          marked.length
            ? "Add Selection to Collection"
            : "Add Word to Collection"
        }
        onAction={() =>
          push(
            <CollectionPicker
              allowAll={false}
              onSelect={async (id) => {
                const ids = marked.length ? marked : activeId ? [activeId] : [];
                await store.mutate((lib) =>
                  changeCollectionMembers(lib, id, ids, true),
                );
                await safeRefresh();
                void autoBackup();
              }}
            />,
          )
        }
      />
      {selectedCollection && (
        <Action
          title={
            marked.length
              ? "Remove Selection from Collection"
              : "Remove Word from Collection"
          }
          onAction={async () => {
            try {
              await store.mutate((lib) =>
                changeCollectionMembers(
                  lib,
                  collectionId,
                  marked.length ? marked : activeId ? [activeId] : [],
                  false,
                ),
              );
              await safeRefresh();
              void autoBackup();
            } catch (error) {
              await report(error);
            }
          }}
        />
      )}
    </ActionPanel.Section>
  );
  const [rangeStart, setRangeStart] = useState<RangeStart>();
  const batchLock = useRef(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(defaults),
    [sort, setSort] = useState("activity"),
    [marked, setMarked] = useState<string[]>([]),
    [selection, setSelection] = useState<string>(),
    [selectedRow, setSelectedRow] = useState<string>(),
    [showIPA, setShowIPA] = useState(false),
    [shuffle, setShuffle] = useState(0),
    [visibleCount, setVisibleCount] = useState(80),
    [recentErrors, setRecentErrors] = useState(false);
  const baseLanguage = preferences().languageMode;
  const {
    value: savedEnglish,
    setValue: setShowEnglish,
    isLoading: englishLoading,
  } = useLocalStorage<boolean>(
    `browse-english-visible-v2-${baseLanguage ?? "zh-first"}`,
    baseLanguage !== "zh-only",
  );
  const showEnglish = savedEnglish ?? baseLanguage !== "zh-only";
  const toggleEnglish = async () => {
    if (englishLoading) return;
    try {
      await setShowEnglish(!showEnglish);
    } catch (error) {
      await report(error);
    }
  };
  const [session, setSession] = useState<ProcessingSession>();
  const [processing, setProcessing] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const sessionLock = useRef(false);
  const sessionKey =
    (archived ? "processing-archive" : "processing-active") +
    (collectionId ? `-collection-${collectionId}` : "");
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setSessionLoading(true);
    void store
      .getMeta<ProcessingSession | null>(sessionKey)
      .then((saved) => {
        if (!cancelled) {
          setSession(saved?.libraryId === lib.libraryId ? saved : undefined);
          setSessionLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setSessionLoading(false);
        void report(e);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, lib.libraryId, sessionKey]);
  const updateSession = async (next: ProcessingSession | undefined) => {
    await store.setMeta(sessionKey, next ?? null);
    setSession(next);
  };
  const activityOrder = useRef<
    { libraryId: string; ids: string[] } | undefined
  >(undefined);
  if (!loading && activityOrder.current?.libraryId !== lib.libraryId) {
    activityOrder.current = {
      libraryId: lib.libraryId,
      ids: sortWords(lib.words, lib, "activity", new Map()).map((w) => w.id),
    };
  }
  const random = useRef(new Map<string, number>());
  const speaking = useRef(false);
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
        .then(() => {
          void autoBackup();
        })
        .catch(report);
    }, 450);
    return () => clearTimeout(timer);
  }, [selection]);
  const safeRefresh = useCallback(async () => {
    await viewQueue.current;
    await refresh();
  }, [refresh]);
  const words = useMemo(() => {
    const members = collectionId
      ? new Set(
          collections(lib).find((c) => c.id === collectionId)?.wordIds ?? [],
        )
      : undefined;
    const remaining =
      processing && session
        ? new Set(processingWords(lib, session, archived).map((w) => w.id))
        : undefined;
    for (const w of lib.words)
      if (!random.current.has(w.id)) random.current.set(w.id, Math.random());
    const recentIds = recentErrors ? recentMistakes(lib) : [];
    const recent = new Set(recentIds);
    const result = sortWords(
      lib.words.filter(
        (w) =>
          w.archived === archived &&
          (!members || members.has(w.id)) &&
          (!remaining || remaining.has(w.id)) &&
          (!recentErrors || recent.has(w.id)) &&
          matchesWordFilters(w, filter.pos, filter.familiarity) &&
          (filter.practice === "all" ||
            w.practice === (filter.practice === "included")) &&
          matchesSearch(w, query),
      ),
      lib,
      sort,
      random.current,
    );
    if (sort === "activity" && !recentErrors) {
      const ranks = new Map(activityOrder.current?.ids.map((id, i) => [id, i]));
      result.sort(
        (a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity),
      );
    }
    const ranks = new Map(recentIds.map((id, index) => [id, index]));
    return recentErrors
      ? result.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!)
      : result;
  }, [
    lib,
    filter,
    query,
    sort,
    archived,
    shuffle,
    recentErrors,
    processing,
    session,
    collectionId,
  ]);
  const batch = async (
    kind: "add" | "remove" | "archive" | "fuzzy" | "known" | "unmarked",
    ids = marked,
    targets: string[] = ["default"],
  ) => {
    if (batchLock.current) return false;
    batchLock.current = true;
    setBatchBusy(true);
    try {
      await viewQueue.current;
      const set = new Set(ids);
      await store.mutate((l) => {
        if (kind === "known" || kind === "fuzzy" || kind === "unmarked") {
          setSelectionFamiliarity(l, ids, kind);
          return;
        }
        for (const w of l.words)
          if (set.has(w.id)) {
            if (kind === "archive") w.archived = !archived;
            else setPractice(w, kind === "add");
            w.updatedAt = new Date().toISOString();
          }
        if (kind === "add") addModeWords(l, ids, targets);
      });
      setMarked([]);
      setRangeStart(undefined);
      await safeRefresh();
      await autoBackup();
      return true;
    } catch (e) {
      await report(e);
      return false;
    } finally {
      batchLock.current = false;
      setBatchBusy(false);
    }
  };
  const mark = (id: string) =>
    setMarked((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const batchForm = () =>
    push(
      <BatchPicker
        words={words}
        initial={marked}
        onSave={async (ids, targets) => {
          if (await batch("add", ids, targets)) pop();
        }}
      />,
    );
  const markedSet = useMemo(() => new Set(marked), [marked]);
  const activeId = words.some((w) => w.id === selection)
    ? selection
    : words[0]?.id;
  const rows = useMemo(
    () =>
      words.flatMap((w) =>
        listLayout
          ? w.senses.map((sense) => ({
              id: JSON.stringify([w.id, sense.id]),
              word: w,
              sense,
            }))
          : [{ id: w.id, word: w, sense: w.senses[0] }],
      ),
    [words, listLayout],
  );
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );
  const activeRowId =
    selectedRow && rowById.get(selectedRow)?.word.id === activeId
      ? selectedRow
      : rows.find((row) => row.word.id === activeId)?.id;
  const visibleRows = rows.slice(0, visibleCount);
  useEffect(() => {
    setVisibleCount(80);
  }, [query, filter, sort, recentErrors, collectionId]);
  const markDone = async () => {
    if (!session || !activeId || sessionLock.current) return;
    sessionLock.current = true;
    try {
      const index = words.findIndex((w) => w.id === activeId);
      await updateSession(finishProcessingWord(session, activeId));
      setSelection(words[index + 1]?.id ?? words[index - 1]?.id);
      setMarked((ids) => ids.filter((id) => id !== activeId));
    } catch (e) {
      await report(e);
    } finally {
      sessionLock.current = false;
    }
  };
  const processingActions = (
    <ActionPanel.Section title="Processing Session">
      {processing ? (
        <>
          <Action
            title="Mark as Done"
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={markDone}
          />
          <Action
            title="Pause Processing Session"
            onAction={() => {
              setProcessing(false);
              setMarked([]);
              setSelection(undefined);
            }}
          />
        </>
      ) : (
        <>
          {session && (
            <Action
              title="Resume Processing Session"
              shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
              onAction={() => {
                setProcessing(true);
                setQuery("");
                setMarked([]);
                setSelection(undefined);
              }}
            />
          )}
          <Action
            title="Start Processing Session"
            shortcut={
              session ? undefined : { modifiers: ["cmd", "shift"], key: "p" }
            }
            onAction={async () => {
              if (sessionLoading || sessionLock.current || !words.length)
                return;
              sessionLock.current = true;
              try {
                if (
                  session &&
                  !(await confirmAlert({
                    title: "Replace saved processing session?",
                    message:
                      "Reset progress and start a new session with all words in this library view.",
                  }))
                )
                  return;
                await updateSession(
                  startProcessing(
                    lib.libraryId,
                    lib.words.filter(
                      (w) =>
                        w.archived === archived &&
                        (!collectionId ||
                          selectedCollection?.wordIds.includes(w.id)),
                    ),
                  ),
                );
                setProcessing(true);
                setQuery("");
                setMarked([]);
                setSelection(undefined);
              } catch (e) {
                await report(e);
              } finally {
                sessionLock.current = false;
              }
            }}
          />
        </>
      )}
      {session && (
        <Action
          title="Discard Processing Session"
          style={Action.Style.Destructive}
          onAction={async () => {
            if (sessionLock.current) return;
            sessionLock.current = true;
            try {
              if (
                !(await confirmAlert({
                  title: "Discard processing progress?",
                  message: "Vocabulary and practice data are not changed.",
                }))
              )
                return;
              await updateSession(undefined);
              setProcessing(false);
              setSelection(undefined);
            } catch (e) {
              await report(e);
            } finally {
              sessionLock.current = false;
            }
          }}
        />
      )}
    </ActionPanel.Section>
  );
  const accessories = (w: Word): List.Item.Accessory[] => {
    const source = statusIcon(w),
      pos = preferences().listPOS;
    return [
      ...(!listLayout && pos === "right"
        ? [{ text: w.senses[0]?.pos ?? "" }]
        : []),
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
      isLoading={loading || sessionLoading || layoutLoading || batchBusy}
      isShowingDetail={!listLayout}
      pagination={{
        pageSize: 80,
        hasMore: visibleCount < rows.length,
        onLoadMore: () => setVisibleCount((n) => n + 80),
      }}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      selectedItemId={activeRowId}
      onSelectionChange={(id) => {
        setSelectedRow(id ?? undefined);
        setSelection(id ? rowById.get(id)?.word.id : undefined);
        stopSpeech();
      }}
      navigationTitle={
        processing
          ? `Processing Session · ${words.length} Remaining`
          : archived
            ? "Archived Vocabulary"
            : "French Vocabulary"
      }
      searchBarPlaceholder={"Search vocabulary…"}
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
          {processingActions}
          {layoutAction}
          {collectionActions()}
          <Action
            title="Import Vocabulary"
            onAction={() => push(<ImportVocabulary onImported={safeRefresh} />)}
          />
          <Action
            title="Filters"
            shortcut={{ modifiers: ["cmd"], key: "f" }}
            onAction={() =>
              push(
                <FilterForm
                  initial={filter}
                  onSave={setFilter}
                  library={lib}
                  collectionId={collectionId}
                  onCollectionChange={(id) => {
                    if (id !== collectionId) {
                      setProcessing(false);
                      setMarked([]);
                    }
                    setCollectionId(id);
                  }}
                />,
              )
            }
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title={"No matching vocabulary"}
        description={
          processing
            ? "Change search or filters to find remaining words, or pause this session."
            : undefined
        }
      />
      <List.Section
        title={`${selectedCollection ? selectedCollection.name + " · " : ""}${words.length}${marked.length ? ` · ${marked.length} selected` : ""}`}
      >
        {visibleRows.map(({ id: rowId, word: w, sense }) => (
          <List.Item
            key={rowId}
            id={rowId}
            title={w.word}
            subtitle={
              listLayout
                ? [
                    sense.pos,
                    ...translationValues(
                      sense,
                      sessionTranslationLanguage(baseLanguage, showEnglish),
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                    .replace(/\s+/g, " ")
                    .trim()
                : preferences().listPOS === "below"
                  ? w.senses[0]?.pos
                  : undefined
            }
            icon={
              markedSet.has(w.id)
                ? { source: Icon.CheckCircle, tintColor: Color.Blue }
                : undefined
            }
            accessories={accessories(w)}
            detail={
              !listLayout && w.id === activeId ? (
                <List.Item.Detail
                  markdown={detailMarkdown(
                    w,
                    showIPA,
                    sessionTranslationLanguage(
                      preferences().languageMode,
                      showEnglish,
                    ),
                  )}
                />
              ) : undefined
            }
            actions={
              rowId === activeRowId ? (
                <ActionPanel>
                  <Action
                    title="Speak"
                    icon={Icon.SpeakerHigh}
                    onAction={async () => {
                      if (speaking.current) return;
                      speaking.current = true;
                      try {
                        await speakWord(w);
                      } catch (e) {
                        await report(e);
                      } finally {
                        speaking.current = false;
                      }
                    }}
                  />
                  {!archived && (
                    <Action
                      title="Copy Spelling"
                      icon={Icon.Pencil}
                      onAction={() => {
                        const queue = copyQuestionsInOrder(lib, words);
                        if (!queue.length) {
                          void report(
                            Error(
                              "No eligible words. Words must be included in practice and have a usable spelling.",
                            ),
                          );
                          return;
                        }
                        stopSpeech();
                        push(
                          <PracticeSession
                            queue={queue}
                            manageWords
                            library={lib}
                            collectionId={collectionId}
                            autoSpeak={modeSettings(lib, "copy").autoSpeak}
                            onFinished={safeRefresh}
                          />,
                        );
                      }}
                    />
                  )}
                  {processingActions}
                  {layoutAction}
                  {collectionActions()}
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
                  <ActionPanel.Section
                    title={
                      rangeStart
                        ? `Selection · Start: ${lib.words.find((word) => word.id === rangeStart.wordId)?.word ?? "Unavailable"}`
                        : "Selection"
                    }
                  >
                    <Action
                      title="Set Range Start"
                      onAction={async () => {
                        setRangeStart(
                          startSelectionRange(
                            words.map((word) => word.id),
                            w.id,
                          ),
                        );
                        setMarked([w.id]);
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Range start set",
                          message:
                            "Move to the last word and choose Select Range to Here.",
                        });
                      }}
                    />
                    {rangeStart && (
                      <Action
                        title="Select Range to Here"
                        onAction={async () => {
                          try {
                            const ids = selectWordRange(
                              words.map((word) => word.id),
                              rangeStart,
                              w.id,
                            );
                            setMarked(ids);
                            await showToast({
                              style: Toast.Style.Success,
                              title: `${ids.length} words selected`,
                            });
                          } catch (error) {
                            await report(error);
                          }
                        }}
                      />
                    )}
                    {rangeStart && (
                      <Action
                        title="Clear Range Start"
                        onAction={() => setRangeStart(undefined)}
                      />
                    )}
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
                      onAction={batchForm}
                    />
                    {marked.length > 0 && (
                      <>
                        <Action
                          title="Mark Selection Fuzzy"
                          onAction={() => batch("fuzzy")}
                        />
                        <Action
                          title="Mark Selection Know"
                          onAction={() => batch("known")}
                        />
                        <Action
                          title="Clear Selection Familiarity"
                          onAction={() => batch("unmarked")}
                        />
                        <Action
                          title="Add Selection to Confusion Group"
                          shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
                          onAction={() => push(<AddToGroup ids={marked} />)}
                        />
                        <Action
                          title="Remove Selection from Practice"
                          shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
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
                          shortcut={Keyboard.Shortcut.Common.Copy}
                          onAction={() => {
                            setMarked([]);
                            setRangeStart(undefined);
                          }}
                        />
                      </>
                    )}
                  </ActionPanel.Section>
                  <Action
                    title="Filters"
                    icon={Icon.Filter}
                    shortcut={{ modifiers: ["cmd"], key: "f" }}
                    onAction={() =>
                      push(
                        <FilterForm
                          initial={filter}
                          onSave={setFilter}
                          library={lib}
                          collectionId={collectionId}
                          onCollectionChange={(id) => {
                            if (id !== collectionId) {
                              setProcessing(false);
                              setMarked([]);
                            }
                            setCollectionId(id);
                          }}
                        />,
                      )
                    }
                  />
                  <Action
                    title={showIPA ? "Hide IPA" : "Show IPA"}
                    onAction={() => setShowIPA((x) => !x)}
                  />
                  {preferences().languageMode !== "en-only" && (
                    <Action
                      title={
                        showEnglish
                          ? "Hide English Meanings"
                          : "Show English Meanings"
                      }
                      onAction={toggleEnglish}
                    />
                  )}
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
                    shortcut={Keyboard.Shortcut.Common.Refresh}
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
  onSave: (ids: string[], targets: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Form
      isLoading={busy}
      navigationTitle="Add Selection to Practice"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Selected Words"
            onSubmit={async (v: { ids: string[]; targets: string[] }) => {
              if (busy) return;
              if (!v.ids.length || !v.targets.length) {
                await report(
                  Error("Choose at least one word and one destination."),
                );
                return;
              }
              setBusy(true);
              try {
                await onSave(v.ids, v.targets);
              } finally {
                setBusy(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TagPicker id="ids" title="Words" defaultValue={initial}>
        {words.map((w) => (
          <Form.TagPicker.Item key={w.id} value={w.id} title={w.word} />
        ))}
      </Form.TagPicker>
      <Form.TagPicker
        id="targets"
        title="Practice Libraries"
        defaultValue={["default"]}
      >
        <Form.TagPicker.Item value="default" title="Default Library" />
        {practiceModes.map(({ mode, title }) => (
          <Form.TagPicker.Item key={mode} value={mode} title={title} />
        ))}
      </Form.TagPicker>
      <Form.Description text="Mode destinations append words to that mode’s selected list and activate Selected Words Only. All added words are globally enabled for practice; other modes using Default Library can also include them. Remove Selection from Practice disables them across all modes." />
    </Form>
  );
}
function FilterForm({
  initial,
  onSave,
  library,
  collectionId,
  onCollectionChange,
}: {
  initial: Filters;
  library: Library;
  collectionId: string;
  onCollectionChange: (id: string) => void;
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
            onSubmit={(v: Filters & { collection: string }) => {
              onCollectionChange(v.collection);
              onSave({
                pos: v.pos,
                familiarity: v.familiarity,
                practice: v.practice,
              });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="collection"
        title="Collection"
        defaultValue={collectionId}
      >
        <Form.Dropdown.Item value="" title="All Words" />
        {collections(library).map((c) => (
          <Form.Dropdown.Item key={c.id} value={c.id} title={c.name} />
        ))}
      </Form.Dropdown>
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
