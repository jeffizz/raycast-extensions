import {
  Action,
  ActionPanel,
  confirmAlert,
  Icon,
  List,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { Fragment, useEffect, useRef, useState } from "react";
import { Grade } from "ts-fsrs";
import { AIWordActions } from "./ai/workflow";
import { RelatedConfusionGroups } from "./components/related-confusion-groups";
import { ReinforcementQuestion } from "./components/reinforcement-question";
import {
  Choice,
  ReinforcementState,
  reinforcementState,
  reinforceAfterRecall,
  reinforceAfterChoice,
  reinforcementChoices,
} from "./core/reinforcement";
import { modeIncludes } from "./core/practice-settings";
import {
  practiceLayoutKey,
  optionalMeaningSpelling,
  practiceListRow,
  supportsDelayedPronunciation,
} from "./core/practice-view";
import { PracticeSource } from "./components/practice-source";
import { ManageCollections } from "./components/collections";
import {
  collectionSelectionLabel,
  collectionWordIds,
} from "./core/collections";
import { useLocalStorage, usePromise } from "@raycast/utils";
import { dailySummary, limitDailyQueue } from "./core/daily-limits";
import { DailyLimits } from "./components/daily-limits";
import {
  compactCopyQueue,
  nextPracticeIndex,
  practiceWindow,
  SessionResult,
  sessionRatingLabels,
} from "./core/copy-session";
import {
  checkAnswer,
  Question,
  questions,
  recallOrders,
  RecallOrder,
  orderRecallQuestions,
  recordAnswer,
  recallIntervalPreview,
  formatReviewDelay,
  shouldAutoSubmit,
  practiceSpeechTexts,
} from "./core/learning";
import { speechWord, Mode, Word, Library } from "./core/model";
import { autoBackup, preferences, report, store, useLibrary } from "./runtime";
import { prepareSpeech, speakTexts, speakWord, stopSpeech } from "./speech";
import { escapeMD } from "./components/word";
import { contentAccessories } from "./components/content-status";
import {
  translations,
  sessionTranslationLanguage,
  spellingMarkdown,
  spellingDiff,
} from "./core/presentation";
import {
  modeSettings,
  toggleAutoSpeak,
  practiceSourceFilters,
} from "./core/practice-settings";
export default function Practice() {
  return <PracticeMenu />;
}
export function PracticeMenu({ wordIds }: { wordIds?: string[] }) {
  const { lib, loading, refresh } = useLibrary(true, true),
    { push } = useNavigation();
  const practiceWordIds = wordIds;
  const [all, setAll] = useState(false);
  const [orders, setOrders] = useState<Partial<Record<Mode, RecallOrder>>>({});
  const modes: {
    mode: Mode;
    title: string;
    description: string;
    icon: Icon;
  }[] = [
    {
      mode: "copy",
      title: "Copy Spelling",
      description:
        "See the word and type it. Does not change recall scheduling.",
      icon: Icon.Pencil,
    },
    {
      mode: "meaning",
      title: "Recall Meaning",
      description: "Reveal the meanings, then grade your recall.",
      icon: Icon.Book,
    },
    {
      mode: "spelling",
      title: "Recall Spelling",
      description: "Type the French word from its translations.",
      icon: Icon.Text,
    },
    {
      mode: "gender",
      title: "Noun Gender",
      description:
        "Choose masculine or feminine; ambiguous senses are excluded.",
      icon: Icon.TwoPeople,
    },
  ];
  return (
    <List
      isLoading={loading}
      isShowingDetail
      navigationTitle="Practice Vocabulary"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Practice Scope"
          value={all ? "all" : "due"}
          onChange={(v) => setAll(v === "all")}
        >
          <List.Dropdown.Item value="due" title="Due and New" />
          <List.Dropdown.Item
            value="all"
            title="All Included Words (Extra Practice)"
          />
        </List.Dropdown>
      }
    >
      <List.Section
        title={`${lib.words.filter((w) => w.practice && !w.archived && (!practiceWordIds || practiceWordIds.includes(w.id))).length} active words included`}
      >
        {modes.map((m) => {
          const filters = practiceSourceFilters(modeSettings(lib, m.mode));
          const collectionId = filters.collectionId;
          const collectionLabel = collectionSelectionLabel(lib, collectionId);
          const candidates = questions(
            lib,
            m.mode,
            all,
            practiceWordIds,
            undefined,
          );
          const ordered =
            m.mode === "copy"
              ? candidates
              : orderRecallQuestions(
                  candidates,
                  lib,
                  orders[m.mode] ?? "scheduled",
                );
          const queue = all ? ordered : limitDailyQueue(lib, m.mode, ordered);
          const summary =
            m.mode === "copy"
              ? ""
              : "\n\n" +
                dailySummary(lib, m.mode) +
                "\n\n**Due remaining in source:** " +
                candidates.filter((q) => lib.cards.some((c) => c.id === q.id))
                  .length +
                (all
                  ? "\n\nExtra practice: daily limits and due dates are bypassed; answers still update FSRS."
                  : "");
          return (
            <List.Item
              key={m.mode}
              title={m.title}
              icon={m.icon}
              accessories={[{ text: `${queue.length} cards` }]}
              detail={
                <List.Item.Detail
                  markdown={`# ${m.title}\n\n${m.description}\n\n${queue.length} cards\n\n**Auto pronunciation:** ${modeSettings(lib, m.mode).autoSpeak ? "On" : "Off"}${summary}\n\n**Collection:** ${collectionLabel}\n\n**Part of speech:** ${filters.pos}\n\n**Familiarity:** ${{ all: "All", unmarked: "No Status", fuzzy: "Fuzzy", known: "Know" }[filters.familiarity]}`}
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Start Practice"
                    icon={Icon.Play}
                    onAction={() => {
                      if (!queue.length && m.mode === "copy") {
                        void showToast({
                          style: Toast.Style.Failure,
                          title: "No eligible cards",
                          message:
                            "Check exclusions in Browse, gender/variant fields, or choose All Included Words.",
                        });
                        return;
                      }
                      push(
                        <PracticeSession
                          queue={queue}
                          extraPractice={all}
                          library={lib}
                          collectionId={collectionId}
                          mode={m.mode}
                          autoSpeak={modeSettings(lib, m.mode).autoSpeak}
                          onFinished={refresh}
                        />,
                      );
                    }}
                  />
                  <Action
                    title="Manage Collections"
                    onAction={() =>
                      push(<ManageCollections onChanged={refresh} />)
                    }
                  />
                  {m.mode !== "copy" && (
                    <Action
                      title="Daily Limits"
                      onAction={() =>
                        push(
                          <DailyLimits
                            library={lib}
                            mode={m.mode}
                            refresh={refresh}
                          />,
                        )
                      }
                    />
                  )}
                  <Action
                    title="Practice Source"
                    onAction={() =>
                      push(
                        <PracticeSource
                          library={lib}
                          mode={m.mode}
                          refresh={refresh}
                        />,
                      )
                    }
                  />
                  {m.mode !== "copy" && (
                    <ActionPanel.Submenu
                      title={`Practice Order: ${recallOrders.find((o) => o.value === (orders[m.mode] ?? "scheduled"))!.title}`}
                    >
                      {recallOrders.map((order) => (
                        <Action
                          key={order.value}
                          title={order.title}
                          onAction={() =>
                            setOrders((previous) => ({
                              ...previous,
                              [m.mode]: order.value,
                            }))
                          }
                        />
                      ))}
                    </ActionPanel.Submenu>
                  )}
                  <Action
                    title={
                      modeSettings(lib, m.mode).autoSpeak
                        ? "Disable Auto Pronunciation"
                        : "Enable Auto Pronunciation"
                    }
                    onAction={async () => {
                      try {
                        await store.mutate((l) => toggleAutoSpeak(l, m.mode));
                        await refresh();
                        void autoBackup();
                      } catch (e) {
                        await report(e);
                      }
                    }}
                  />
                  <Action title="Refresh" onAction={refresh} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
type CopyProgress = {
  reinforcementAttempts?: Record<string, number>;
  libraryId: string;
  queue: Question[];
  index: number;
  saved: string[];
  results: SessionResult[];
  answer: string;
  revealed: boolean;
};
type SessionProps = {
  collectionId?: string;
  mode?: Mode;
  extraPractice?: boolean;
  library?: Library;
  queue: Question[];
  manageWords?: boolean;
  autoSpeak: boolean;
  onFinished: () => Promise<void>;
};
export function PracticeSession(props: SessionProps) {
  const mode = props.mode ?? props.queue[0]?.mode ?? "copy";
  const sessionKey =
    (mode === "copy" ? "copy-spelling-session" : `practice-session-${mode}`) +
    (props.collectionId ? `-collection-${props.collectionId}` : "");
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<CopyProgress>();
  const [choice, setChoice] = useState<"resume" | "new">();
  const [libraryId, setLibraryId] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [speakAfterSubmit, setSpeakAfterSubmit] = useState(false);
  const [advanceAfterCorrect, setAdvanceAfterCorrect] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      const setting = await LocalStorage.getItem<boolean>(
        `auto-advance-${props.queue[0]?.mode}`,
      );
      if (active) setAutoAdvance(setting ?? false);
      const timing = await LocalStorage.getItem<boolean>(
        `speak-after-submit-${props.queue[0]?.mode}`,
      );
      if (active) setSpeakAfterSubmit(timing ?? false);
      const advance = await LocalStorage.getItem<boolean>(
        `advance-after-correct-${props.queue[0]?.mode}`,
      );
      if (active) setAdvanceAfterCorrect(advance ?? true);
      {
        const lib = props.library ?? (await store.load(false));
        if (active) setLibraryId(lib.libraryId);
        const stored = await store.getMeta<
          CopyProgress & { queue: (Question & { wordId?: string })[] }
        >(sessionKey);
        if (
          stored?.libraryId === lib.libraryId &&
          stored.index < stored.queue.length
        ) {
          const words = new Map(lib.words.map((w) => [w.id, w]));
          const hydrate = (q: Question & { wordId?: string }) => {
            const word = words.get(q.wordId ?? q.word?.id);
            const sense =
              mode === "gender"
                ? word?.senses.find((s) => `${word.id}:gender:${s.id}` === q.id)
                : word?.senses[0];
            return word && sense
              ? {
                  ...q,
                  word,
                  sense,
                  mode,
                  due: 0,
                }
              : undefined;
          };
          const completed = stored.queue.slice(0, stored.index).flatMap((q) => {
            const item = hydrate(q);
            return item ? [item] : [];
          });
          const collectionMembers = props.collectionId
            ? new Set(collectionWordIds(lib, props.collectionId))
            : undefined;
          const remaining = stored.queue.slice(stored.index).flatMap((q) => {
            const item = hydrate(q);
            return item &&
              (!collectionMembers || collectionMembers.has(item.word.id)) &&
              !item.word.archived &&
              item.word.practice &&
              (mode === "gender"
                ? item.sense.gender === item.expected &&
                  ["m", "f"].includes(item.expected)
                : speechWord(item.word) === item.expected)
              ? [item]
              : [];
          });
          const ordered =
            mode === "copy"
              ? [
                  ...remaining.filter((q) => q.word.familiarity !== "known"),
                  ...remaining.filter((q) => q.word.familiarity === "known"),
                ]
              : remaining;
          const sameQuestion =
            ordered[0]?.id === stored.queue[stored.index]?.id;
          if (active && ordered.length)
            setProgress({
              ...stored,
              index: completed.length,
              queue: [...completed, ...ordered],
              answer: sameQuestion ? stored.answer : "",
              revealed: sameQuestion && stored.revealed,
            });
        }
      }
      if (active) setReady(true);
    })().catch(async (error) => {
      await report(error);
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!ready)
    return (
      <List
        isLoading
        navigationTitle={
          mode === "copy"
            ? "Copy Spelling"
            : mode === "meaning"
              ? "Recall Meaning"
              : mode === "spelling"
                ? "Recall Spelling"
                : "Noun Gender"
        }
      />
    );
  if (progress && !choice)
    return (
      <List
        isLoading={!ready}
        isShowingDetail
        navigationTitle={
          mode === "copy"
            ? "Copy Spelling"
            : mode === "meaning"
              ? "Recall Meaning"
              : mode === "spelling"
                ? "Recall Spelling"
                : "Noun Gender"
        }
      >
        {progress && (
          <List.Item
            title="Resume Session"
            subtitle={`${progress.index} / ${progress.queue.length} completed`}
            detail={
              <List.Item.Detail markdown="Continue the saved queue and progress." />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Resume Session"
                  onAction={() => setChoice("resume")}
                />
              </ActionPanel>
            }
          />
        )}
        <List.Item
          title="Start New Session"
          detail={
            <List.Item.Detail
              markdown={
                ready
                  ? "Start with the current word order and filters. This replaces saved progress."
                  : "Loading saved progress…"
              }
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Start New Session"
                onAction={async () => {
                  if (!ready) return;
                  if (
                    progress &&
                    !(await confirmAlert({
                      title: "Replace saved practice progress?",
                      primaryAction: { title: "Start New Session" },
                    }))
                  )
                    return;
                  if (!props.queue.length) {
                    await showToast({
                      style: Toast.Style.Failure,
                      title: "No eligible cards",
                      message:
                        "Choose All Included Words or change Practice Source to start a new session.",
                    });
                    return;
                  }
                  setProgress(undefined);
                  setChoice("new");
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  if (!props.queue.length && choice !== "resume")
    return (
      <List navigationTitle="Practice">
        <List.EmptyView
          title="No eligible cards"
          description="Choose All Included Words or change Practice Source."
        />
      </List>
    );
  return ready ? (
    <ActivePracticeSession
      {...props}
      queue={choice === "resume" ? progress!.queue : props.queue}
      initialProgress={choice === "resume" ? progress : undefined}
      sessionLibraryId={libraryId}
      sessionKey={sessionKey}
      extraPractice={choice === "resume" ? false : props.extraPractice}
      initialAutoAdvance={autoAdvance}
      initialSpeakAfterSubmit={speakAfterSubmit}
      initialAdvanceAfterCorrect={advanceAfterCorrect}
    />
  ) : (
    <List isLoading />
  );
}
function ActivePracticeSession({
  queue,
  autoSpeak: initialAutoSpeak,
  manageWords = true,
  initialProgress,
  sessionLibraryId,
  sessionKey,
  extraPractice = false,
  initialAutoAdvance,
  initialSpeakAfterSubmit,
  initialAdvanceAfterCorrect,
  onFinished,
}: {
  queue: Question[];
  initialProgress?: CopyProgress;
  sessionLibraryId: string;
  sessionKey: string;
  extraPractice?: boolean;
  initialAutoAdvance: boolean;
  initialSpeakAfterSubmit: boolean;
  initialAdvanceAfterCorrect: boolean;
  manageWords?: boolean;
  autoSpeak: boolean;
  onFinished: () => Promise<void>;
}) {
  const [index, setIndex] = useState(initialProgress?.index ?? 0),
    [answer, setAnswer] = useState(initialProgress?.answer ?? ""),
    [revealed, setRevealed] = useState(initialProgress?.revealed ?? false),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<SessionResult[]>(
      initialProgress?.results ?? [],
    ),
    [selected, setSelected] = useState<string>();
  const initialQuestionId = useRef(initialProgress ? undefined : queue[0]?.id);
  const initialSelectionPending = useRef(!!initialQuestionId.current);
  const [initialRowsPending, setInitialRowsPending] = useState(
    !!initialQuestionId.current,
  );
  useEffect(() => {
    if (initialQuestionId.current) setSelected(initialQuestionId.current);
  }, []);
  const { value: savedListLayout = false, setValue: setListLayout } =
    useLocalStorage<boolean>(practiceLayoutKey(queue[0].mode), false);
  const [wordUpdates, setWordUpdates] = useState<Record<string, Word>>({});
  const [autoSpeak, setAutoSpeak] = useState(initialAutoSpeak);
  const [autoAdvance, setAutoAdvance] = useState(initialAutoAdvance);
  const [speakAfterSubmit, setSpeakAfterSubmit] = useState(
    initialSpeakAfterSubmit,
  );
  const [advanceAfterCorrect, setAdvanceAfterCorrect] = useState(
    initialAdvanceAfterCorrect,
  );
  const correctAdvanceLock = useRef(false);
  const toggleCorrectAdvance = async () => {
    if (correctAdvanceLock.current || working.current || ending.current) return;
    correctAdvanceLock.current = true;
    try {
      const next = !advanceAfterCorrect;
      await LocalStorage.setItem(
        `advance-after-correct-${queue[0].mode}`,
        next,
      );
      setAdvanceAfterCorrect(next);
    } catch (error) {
      await report(error);
    } finally {
      correctAdvanceLock.current = false;
    }
  };
  const timingLock = useRef(false);
  const spokenSubmissions = useRef(new Set<string>());
  const toggleSpeechTiming = async () => {
    if (timingLock.current || working.current || ending.current) return;
    timingLock.current = true;
    try {
      const next = !speakAfterSubmit;
      await LocalStorage.setItem(`speak-after-submit-${queue[0].mode}`, next);
      setSpeakAfterSubmit(next);
    } catch (error) {
      await report(error);
    } finally {
      timingLock.current = false;
    }
  };
  const {
    value: savedCopyEnglish,
    setValue: setCopyEnglish,
    isLoading: englishLoading,
  } = useLocalStorage<boolean>(
    `${queue[0].mode === "copy" ? "copy-spelling" : `practice-${queue[0].mode}`}-english-visible-v2-${preferences().languageMode ?? "zh-first"}`,
    preferences().languageMode !== "zh-only",
  );
  const showEnglish =
    savedCopyEnglish ?? preferences().languageMode !== "zh-only";
  const toggleEnglish = async () => {
    if (englishLoading) return;
    try {
      await setCopyEnglish(!showEnglish);
    } catch (error) {
      await report(error);
    }
  };
  const togglingAdvance = useRef(false);
  const toggleAutoAdvance = async () => {
    if (togglingAdvance.current) return;
    togglingAdvance.current = true;
    try {
      const enabled = !autoAdvance;
      await LocalStorage.setItem(`auto-advance-${queue[0].mode}`, enabled);
      setAutoAdvance(enabled);
    } catch (error) {
      await report(error);
    } finally {
      togglingAdvance.current = false;
    }
  };
  const togglingAudio = useRef(false);
  const togglePronunciation = async () => {
    if (togglingAudio.current || ending.current) return;
    togglingAudio.current = true;
    try {
      const enabled = await store.mutate((l) =>
        toggleAutoSpeak(l, queue[0].mode),
      );
      setAutoSpeak(enabled);
      void autoBackup();
    } catch (e) {
      await report(e);
    } finally {
      togglingAudio.current = false;
    }
  };
  const { value: mixChoices = false, setValue: setMixChoices } =
    useLocalStorage<boolean>("meaning-mix-multiple-choice", false);
  const {
    value: updateFamiliarityFromRating = false,
    setValue: setUpdateFamiliarityFromRating,
    isLoading: familiaritySettingLoading,
  } = useLocalStorage<boolean>("meaning-update-familiarity-from-rating", false);
  const familiarityToggleLock = useRef(false);
  const reinforcement = useRef<ReinforcementState | undefined>(undefined);
  const attempts = useRef<Record<string, number>>(
    initialProgress?.reinforcementAttempts ?? {},
  );
  const [challenge, setChallenge] = useState<{
    word: Word;
    choices: Choice[];
  }>();
  const selectionEpoch = useRef(0);
  const renderedSelectionEpoch = selectionEpoch.current;
  const [returnToQuestionPending, setReturnToQuestionPending] =
    useState(!!initialProgress);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let active = true;
    void store
      .getMeta<ReinforcementState>("meaning-reinforcement")
      .then((state) => {
        if (active && state?.libraryId === sessionLibraryId)
          setPendingCount(state.tasks.length);
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [sessionLibraryId]);
  const updateReinforcement = async (
    lib: Library,
    wordId: string,
    again: boolean,
  ) => {
    const previous = reinforcementState(
      lib,
      await store.getMeta<ReinforcementState>("meaning-reinforcement"),
    );
    const next = reinforceAfterRecall(previous, wordId, again);
    await store.setMeta("meaning-reinforcement", next);
    reinforcement.current = next;
    setPendingCount(next.tasks.length);
    if (!mixChoices || next.gap < 3) return;
    for (const task of next.tasks) {
      if (task.others.length < 5 || (attempts.current[task.wordId] ?? 0) >= 2)
        continue;
      const word = lib.words.find((w) => w.id === task.wordId);
      if (
        !word ||
        word.archived ||
        !word.practice ||
        !modeIncludes(lib, "meaning", word.id, undefined, word)
      )
        continue;
      const choices = reinforcementChoices(
        lib,
        word,
        preferences().languageMode === "en-only",
      );
      if (choices) {
        selectionEpoch.current++;
        setChallenge({ word, choices });
        break;
      }
    }
  };
  const saved = useRef(new Set<string>(initialProgress?.saved));
  const resultLog = useRef(initialProgress?.results ?? []);
  const ratingLabels = sessionRatingLabels(results, [...saved.current]);
  const progressWrites = useRef<Promise<unknown>>(Promise.resolve());
  const persistProgress = (nextIndex: number, text = "", shown = false) => {
    const snapshot = {
      reinforcementAttempts: { ...attempts.current },
      queue: compactCopyQueue(queue),
      index: nextIndex,
      saved: [...saved.current],
      results: [...resultLog.current],
      answer: text,
      revealed: shown,
    };
    progressWrites.current = progressWrites.current
      .catch(() => {})
      .then(async () => {
        await store.setMeta(
          sessionKey,
          nextIndex >= queue.length
            ? null
            : { ...snapshot, libraryId: sessionLibraryId },
        );
      });
    return progressWrites.current;
  };
  useEffect(() => {
    void persistProgress(
      initialProgress?.index ?? 0,
      initialProgress?.answer,
      initialProgress?.revealed,
    ).catch(report);
  }, []);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const ending = useRef(false);
  const working = useRef(false),
    { push, pop } = useNavigation();
  const window = practiceWindow(index, queue.length);
  const submissionVersion = useRef(0);
  const current = queue[index];
  const q =
    current && wordUpdates[current.word.id]
      ? { ...current, word: wordUpdates[current.word.id] }
      : current;
  const { data: intervalPreview } = usePromise(
    async (id: string) => {
      const entry = await store.getPracticeCard(id);
      return {
        id,
        text: recallIntervalPreview(entry?.card)
          .map(
            (option) => `${option.label} ${formatReviewDelay(option.delayMs)}`,
          )
          .join(" · "),
      };
    },
    [current?.id ?? ""],
    { execute: !!current && current.mode === "meaning" && revealed },
  );
  const done = index >= queue.length,
    copy = q?.mode === "copy";
  const updateCurrentWord = async (
    change: (word: Word) => void,
    skip = false,
  ) => {
    if (!q || working.current || ending.current) return;
    working.current = true;
    setBusy(true);
    try {
      let updated: Word | undefined;
      pending.current = store.updateWord(q.word.id, (word) => {
        change(word);
        updated = structuredClone(word);
      });
      await pending.current;
      if (updated)
        setWordUpdates((previous) => ({ ...previous, [q.word.id]: updated! }));
      if (skip) {
        submissionVersion.current++;
        const nextIndex = nextPracticeIndex(queue, index + 1, {
          ...wordUpdates,
          ...(updated ? { [q.word.id]: updated } : {}),
        });
        await persistProgress(nextIndex);
        stopSpeech();
        setIndex(nextIndex);
        setSelected(queue[nextIndex]?.id);
        setReturnToQuestionPending(false);
        setAnswer("");
        setRevealed(false);
      }
      void autoBackup();
    } catch (error) {
      await report(error);
    } finally {
      pending.current = Promise.resolve();
      working.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    stopSpeech();
    if (q && autoSpeak && !challenge) {
      if (
        speakAfterSubmit &&
        supportsDelayedPronunciation(q.mode) &&
        !(q.mode === "meaning" && revealed)
      ) {
        prepareSpeech(practiceSpeechTexts(q, true));
      } else {
        void speakTexts(practiceSpeechTexts(q, revealed)).catch(report);
      }
    }
    return () => stopSpeech();
  }, [current, autoSpeak, speakAfterSubmit, challenge]);
  const finish = async () => {
    if (ending.current) return;
    ending.current = true;
    submissionVersion.current++;
    stopSpeech();
    try {
      await pending.current;
      await progressWrites.current;
      await autoBackup();
      await onFinished();
      pop();
    } catch (error) {
      await report(error);
    } finally {
      ending.current = false;
    }
  };
  const awaitReinforcementLibrary = useRef<Library | undefined>(undefined);
  const submit = async (
    rating: Grade,
    explicitAnswer?: string,
    advance = true,
  ) => {
    if (
      !q ||
      working.current ||
      ending.current ||
      (q.mode === "meaning" && familiaritySettingLoading)
    )
      return;
    working.current = true;
    setBusy(true);
    const version = ++submissionVersion.current;
    const value = explicitAnswer ?? answer;
    const checked = checkAnswer(value, q.expected);
    const correct = q.mode === "meaning" ? rating !== 1 : checked.correct;
    // Input errors cannot be scored Good/Easy, and copying never updates FSRS.
    const grade: Grade = q.mode !== "meaning" && !correct ? 1 : rating;
    try {
      if (!saved.current.has(q.id)) {
        let gradedWord: Word | undefined;
        pending.current = store.mutate((l) => {
          if (!extraPractice && !limitDailyQueue(l, q.mode, [q]).length)
            throw Error(
              "Daily limit reached. Progress is preserved. Continue tomorrow, increase Daily Limits, or start All Included Words (Extra Practice).",
            );
          gradedWord = structuredClone(
            recordAnswer(
              l,
              q,
              grade,
              value,
              correct,
              updateFamiliarityFromRating,
            ),
          );
          if (q.mode === "meaning")
            awaitReinforcementLibrary.current = {
              ...l,
              cards: [],
              reviews: [],
            };
        });
        await pending.current;
        if (gradedWord)
          setWordUpdates((previous) => ({
            ...previous,
            [q.word.id]: gradedWord!,
          }));
        void autoBackup();
        saved.current.add(q.id);
        resultLog.current = [
          ...resultLog.current,
          { correct, rating: grade, questionId: q.id },
        ];
        setResults(resultLog.current);
        if (q.mode === "meaning" && awaitReinforcementLibrary.current) {
          try {
            await updateReinforcement(
              awaitReinforcementLibrary.current,
              q.word.id,
              grade === 1,
            );
          } catch (error) {
            await report(error);
          } finally {
            awaitReinforcementLibrary.current = undefined;
          }
        }
      }
      await persistProgress(
        advance ? nextPracticeIndex(queue, index + 1, wordUpdates) : index,
        advance ? "" : value,
        !advance,
      );
      if (
        autoSpeak &&
        speakAfterSubmit &&
        (q.mode === "copy" || q.mode === "spelling") &&
        !spokenSubmissions.current.has(q.id)
      ) {
        spokenSubmissions.current.add(q.id);
        // Keep Enter available while audio loads or plays. A second submit cancels it.
        working.current = false;
        setBusy(false);
        try {
          await speakTexts(practiceSpeechTexts(q, true));
        } catch (error) {
          await report(error);
        }
      }
      if (version !== submissionVersion.current || ending.current) return;
      if (!advance) return;
      const nextIndex = nextPracticeIndex(queue, index + 1, wordUpdates);
      setIndex(nextIndex);
      setSelected(queue[nextIndex]?.id);
      setAnswer("");
      setRevealed(false);
      stopSpeech();
      if (nextIndex === queue.length) {
        await autoBackup();
        await onFinished();
      }
    } catch (e) {
      pending.current = Promise.resolve();
      await report(e);
    } finally {
      if (version === submissionVersion.current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  if (challenge)
    return (
      <ReinforcementQuestion
        word={challenge.word.word}
        correctId={challenge.word.id}
        onEnd={finish}
        choices={challenge.choices}
        onAnswer={async (choice) => {
          const state = reinforcement.current;
          if (!state) throw Error("Reinforcement state unavailable.");
          const next = reinforceAfterChoice(
            state,
            challenge.word.id,
            choice.wordId === challenge.word.id,
          );
          await store.setMeta("meaning-reinforcement", next);
          reinforcement.current = next;
          attempts.current[challenge.word.id] =
            (attempts.current[challenge.word.id] ?? 0) + 1;
          setPendingCount(next.tasks.length);
          await persistProgress(index, answer, revealed);
          if (autoSpeak) void speakWord(challenge.word).catch(report);
        }}
        onContinue={() => {
          stopSpeech();
          selectionEpoch.current++;
          setReturnToQuestionPending(!!queue[index]);
          setSelected(queue[window.start]?.id);
          setChallenge(undefined);
        }}
      />
    );
  if (done)
    return (
      <List navigationTitle="Practice Complete" isShowingDetail>
        <List.Item
          title="Session Complete"
          icon={Icon.CheckCircle}
          detail={
            <List.Item.Detail
              markdown={`# ✓ ${results.filter((r) => r.correct).length} / ${results.length}\n\nReinforcement Pending: ${pendingCount} words`}
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Back to Practice"
                shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                onAction={finish}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  const isInput = q.mode === "copy" || q.mode === "spelling";
  const baseLanguage = preferences().languageMode;
  const language = sessionTranslationLanguage(baseLanguage, showEnglish);
  const displayWord = q.word;
  const displaySense = q.sense;
  const meanings = displayWord.senses
    .map((s) => translations(s, language))
    .filter(Boolean)
    .join("\n\n");
  const prompt = isInput
    ? spellingMarkdown(
        displayWord,
        q.expected,
        answer,
        revealed,
        language,
        copy,
        !checkAnswer(answer, q.expected).correct,
      )
    : q.mode === "gender"
      ? `# ${escapeMD(q.word.word)}\n\n${translations(displaySense, language)}\n\n⌘1 **un**  ⌘2 **une**`
      : `# ${escapeMD(q.word.word)}`;
  const meaningSpelling =
    q.mode === "meaning"
      ? optionalMeaningSpelling(answer, q.expected, revealed)
      : undefined;
  const feedback = !revealed
    ? ""
    : q.mode === "meaning"
      ? `\n\n${meaningSpelling ? spellingDiff(meaningSpelling.answer, meaningSpelling.expected) + "\n\n" : ""}${meanings}`
      : q.mode === "gender"
        ? `\n\n${spellingDiff(`${answer === "m" ? "un" : "une"} ${speechWord(q.word)}`, `${q.sense.gender === "m" ? "un" : "une"} ${speechWord(q.word)}`)}`
        : "";
  const supportsListLayout = supportsDelayedPronunciation(q.mode);
  const listLayout = supportsListLayout && savedListLayout;
  const showErrorDetail =
    listLayout &&
    isInput &&
    revealed &&
    !checkAnswer(answer, q.expected).correct;
  const layoutAction = supportsListLayout ? (
    <Action
      title={savedListLayout ? "Use Detail Layout" : "Use List Layout"}
      onAction={async () => {
        try {
          await setListLayout(!savedListLayout);
        } catch (error) {
          await report(error);
        }
      }}
    />
  ) : null;
  const returnToCurrentQuestion = () => {
    setSelected(q.id);
    setReturnToQuestionPending(false);
  };
  const actions = (
    <ActionPanel>
      {returnToQuestionPending && (
        <Action
          title="Return to Current Question"
          onAction={returnToCurrentQuestion}
        />
      )}
      {!revealed && isInput && (
        <Action
          title="Check Spelling"
          icon={Icon.Check}
          onAction={() => {
            if (!answer.trim()) {
              void report(Error("Type an answer in the search field first."));
              return;
            }
            if (working.current) return;
            if (checkAnswer(answer, q.expected).correct) {
              const pause =
                !autoAdvance &&
                autoSpeak &&
                speakAfterSubmit &&
                !advanceAfterCorrect;
              if (pause) setRevealed(true);
              void submit(3, answer, !pause);
            } else {
              setRevealed(true);
              void submit(1, answer, false);
            }
          }}
        />
      )}
      {!revealed && q.mode === "meaning" && (
        <Action
          title="Reveal Meaning"
          icon={Icon.Eye}
          onAction={() => {
            if (working.current || ending.current) return;
            setRevealed(true);
            void persistProgress(index, answer, true).catch(report);
            if (
              autoSpeak &&
              speakAfterSubmit &&
              !spokenSubmissions.current.has(q.id)
            ) {
              spokenSubmissions.current.add(q.id);
              void speakTexts(practiceSpeechTexts(q, true)).catch(report);
            }
          }}
        />
      )}
      {!revealed && q.mode === "gender" && (
        <>
          <Action
            title="Masculine"
            shortcut={{ modifiers: ["cmd"], key: "1" }}
            onAction={() => {
              if (working.current) return;
              setAnswer("m");
              setRevealed(true);
              void submit(q.expected === "m" ? 3 : 1, "m", false);
            }}
          />
          <Action
            title="Feminine"
            shortcut={{ modifiers: ["cmd"], key: "2" }}
            onAction={() => {
              if (working.current) return;
              setAnswer("f");
              setRevealed(true);
              void submit(q.expected === "f" ? 3 : 1, "f", false);
            }}
          />
        </>
      )}
      {revealed &&
        (q.mode === "meaning" ? null : (
          <>
            <Action
              title={
                checkAnswer(answer, q.expected).correct
                  ? "Continue"
                  : "Continue After Mistake"
              }
              onAction={() =>
                submit(checkAnswer(answer, q.expected).correct ? 3 : 1)
              }
            />
          </>
        ))}
      <Action
        title={
          q.mode === "gender" && !revealed
            ? "Speak Word"
            : "Speak Word and Articles"
        }
        icon={Icon.SpeakerHigh}
        shortcut={{ modifiers: ["cmd"], key: "b" }}
        onAction={() =>
          speakTexts(practiceSpeechTexts(q, revealed)).catch(report)
        }
      />
      <Action
        title="Confusion Groups"
        icon={Icon.List}
        onAction={() => {
          stopSpeech();
          push(<RelatedConfusionGroups wordId={q.word.id} />);
        }}
      />
      <AIWordActions word={q.word} selectedSenseId={q.sense?.id} />
      <Action.OpenInBrowser
        title="Look up in Frdic"
        shortcut={{ modifiers: ["cmd"], key: "d" }}
        url={`eudic-fr://dict/${encodeURIComponent(speechWord(q.word))}`}
      />
      <Action
        title={
          autoSpeak ? "Disable Auto Pronunciation" : "Enable Auto Pronunciation"
        }
        onAction={togglePronunciation}
      />
      {baseLanguage !== "en-only" && (
        <Action
          title={
            showEnglish ? "Hide English Meanings" : "Show English Meanings"
          }
          onAction={toggleEnglish}
        />
      )}
      {supportsDelayedPronunciation(q.mode) && autoSpeak && (
        <Action
          title={
            speakAfterSubmit
              ? "Auto Pronunciation (on Word Entry)"
              : q.mode === "meaning"
                ? "Auto Pronunciation (After Reveal)"
                : "Auto Pronunciation (After Submit)"
          }
          onAction={toggleSpeechTiming}
        />
      )}
      {isInput && (
        <Action
          title={autoAdvance ? "Disable Auto Advance" : "Enable Auto Advance"}
          onAction={toggleAutoAdvance}
        />
      )}
      {isInput && !autoAdvance && autoSpeak && speakAfterSubmit && (
        <Action
          title={
            advanceAfterCorrect
              ? "Disable Advance After Correct Submit"
              : "Enable Advance After Correct Submit"
          }
          onAction={toggleCorrectAdvance}
        />
      )}
      {manageWords && (
        <ActionPanel.Section title="Manage Current Word">
          <Action
            title="Mark Fuzzy"
            shortcut={{
              modifiers: copy ? ["cmd"] : ["cmd", "shift"],
              key: "1",
            }}
            onAction={() =>
              updateCurrentWord((w) => {
                w.familiarity = "fuzzy";
                delete w.meaningFamiliaritySuccessStreak;
              })
            }
          />
          <Action
            title="Mark Know"
            shortcut={{
              modifiers: copy ? ["cmd"] : ["cmd", "shift"],
              key: "2",
            }}
            onAction={() =>
              updateCurrentWord((w) => {
                w.familiarity = "known";
                delete w.meaningFamiliaritySuccessStreak;
              })
            }
          />
          <Action
            title="Clear Familiarity"
            shortcut={{
              modifiers: copy ? ["cmd"] : ["cmd", "shift"],
              key: "0",
            }}
            onAction={() =>
              updateCurrentWord((w) => {
                w.familiarity = "unmarked";
                delete w.meaningFamiliaritySuccessStreak;
              })
            }
          />
          <Action
            title="Archive Word"
            shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
            onAction={() =>
              updateCurrentWord((w) => {
                w.archived = true;
              }, true)
            }
          />
          <Action
            title="Remove from Practice"
            onAction={() =>
              updateCurrentWord((w) => {
                w.practice = false;
              }, true)
            }
          />
        </ActionPanel.Section>
      )}
      {q.mode === "meaning" && (
        <Action
          title={
            updateFamiliarityFromRating
              ? "Disable Update Familiarity from Rating"
              : "Enable Update Familiarity from Rating"
          }
          onAction={async () => {
            if (
              working.current ||
              ending.current ||
              familiaritySettingLoading ||
              familiarityToggleLock.current
            )
              return;
            familiarityToggleLock.current = true;
            try {
              await setUpdateFamiliarityFromRating(
                !updateFamiliarityFromRating,
              );
            } catch (error) {
              await report(error);
            } finally {
              familiarityToggleLock.current = false;
            }
          }}
        />
      )}
      {q.mode === "meaning" && (
        <Action
          title={
            mixChoices
              ? "Disable Multiple Choice Reinforcement"
              : "Mix in Multiple Choice"
          }
          onAction={async () => {
            try {
              await setMixChoices(!mixChoices);
            } catch (error) {
              await report(error);
            }
          }}
        />
      )}
      {layoutAction}
      {revealed && q.mode === "meaning" && (
        <ActionPanel.Section title="Rate Recall">
          <Action
            title="Again"
            shortcut={{ modifiers: ["cmd"], key: "1" }}
            onAction={() => submit(1)}
          />
          <Action
            title="Hard"
            shortcut={{ modifiers: ["cmd"], key: "2" }}
            onAction={() => submit(2)}
          />
          <Action
            title="Good"
            shortcut={{ modifiers: ["cmd"], key: "3" }}
            onAction={() => submit(3)}
          />
          <Action
            title="Easy"
            shortcut={{ modifiers: ["cmd"], key: "4" }}
            onAction={() => submit(4)}
          />
        </ActionPanel.Section>
      )}
      <Action
        title="End Session"
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
        onAction={finish}
      />
    </ActionPanel>
  );
  return (
    <List
      isLoading={busy}
      filtering={false}
      isShowingDetail={!listLayout || showErrorDetail}
      searchText={q.mode === "meaning" && revealed ? "" : answer}
      onSearchTextChange={(v) => {
        if (
          !revealed &&
          (isInput || q.mode === "meaning") &&
          !working.current &&
          !ending.current
        ) {
          setAnswer(v);
          if (
            isInput &&
            autoAdvance &&
            !(autoSpeak && speakAfterSubmit) &&
            shouldAutoSubmit(v, q.expected)
          )
            void submit(3, v);
        }
      }}
      searchBarPlaceholder={
        returnToQuestionPending
          ? "Press Return to locate the current question…"
          : isInput
            ? "Type spelling…"
            : q.mode === "meaning" && revealed
              ? intervalPreview?.id === q.id
                ? intervalPreview.text
                : "Calculating review intervals…"
              : q.mode === "meaning"
                ? "Type spelling (optional), or press Return to reveal…"
                : ""
      }
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (renderedSelectionEpoch !== selectionEpoch.current) return;
        if (initialSelectionPending.current) {
          if (id !== initialQuestionId.current) return;
          initialSelectionPending.current = false;
          setInitialRowsPending(false);
        }
        if (id) setSelected(id);
      }}
      navigationTitle={`${{ copy: "Copy Spelling", spelling: "Recall Spelling", meaning: "Recall Meaning", gender: "Noun Gender" }[q.mode]} · ${index + 1} / ${queue.length}`}
      actions={actions}
    >
      {queue
        .slice(window.start, window.end)
        .flatMap((item, offset) =>
          (listLayout ? item.word.senses : [item.sense]).map(
            (sense, senseIndex) => ({
              item,
              offset,
              sense,
              rowId:
                senseIndex === 0
                  ? item.id
                  : JSON.stringify([item.id, sense.id]),
            }),
          ),
        )
        .filter(
          ({ rowId }) =>
            !initialRowsPending || rowId === initialQuestionId.current,
        )
        .map(({ item, offset, sense, rowId }) => {
          const i = window.start + offset;
          const word = wordUpdates[item.word.id] ?? item.word;
          const row = practiceListRow(
            word,
            sense,
            q.mode,
            i,
            index,
            revealed,
            language,
          );
          return (
            <Fragment key={rowId}>
              <List.Item
                id={rowId}
                title={
                  listLayout
                    ? row.title
                    : q.mode !== "spelling"
                      ? word.word
                      : `${i + 1}`
                }
                subtitle={listLayout ? row.subtitle : undefined}
                accessories={[
                  ...(word.archived
                    ? [{ icon: Icon.Tray, tooltip: "Archived" }]
                    : []),
                  ...(listLayout &&
                  q.mode === "meaning" &&
                  i < index &&
                  ratingLabels.has(item.id)
                    ? [
                        {
                          text: ratingLabels.get(item.id)!,
                          tooltip: "Rating in this session",
                        },
                      ]
                    : []),
                  ...contentAccessories(word),
                ]}
                icon={
                  i < index
                    ? Icon.CheckCircle
                    : i === index
                      ? Icon.ArrowRight
                      : Icon.Circle
                }
                detail={
                  !listLayout || showErrorDetail ? (
                    <List.Item.Detail
                      markdown={i === index ? prompt + feedback : ""}
                    />
                  ) : undefined
                }
                actions={
                  i === index ? (
                    actions
                  ) : (
                    <ActionPanel>
                      <Action
                        title="Return to Current Question"
                        onAction={returnToCurrentQuestion}
                      />
                      {layoutAction}
                      <Action
                        title="End Session"
                        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                        onAction={finish}
                      />
                    </ActionPanel>
                  )
                }
              />
              {listLayout &&
                i === index &&
                meaningSpelling &&
                sense.id ===
                  item.word.senses[item.word.senses.length - 1]?.id && (
                  <>
                    <List.Item
                      id={JSON.stringify([q.id, "spelling-correct"])}
                      title={meaningSpelling.expected}
                      subtitle="Correct Spelling"
                      icon={Icon.CheckCircle}
                      actions={actions}
                    />
                    <List.Item
                      id={JSON.stringify([q.id, "spelling-input"])}
                      title={meaningSpelling.answer}
                      subtitle="Your Input"
                      icon={Icon.XMarkCircle}
                      actions={actions}
                    />
                  </>
                )}
            </Fragment>
          );
        })}
    </List>
  );
}
