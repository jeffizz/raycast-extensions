import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { Grade } from "ts-fsrs";
import {
  checkAnswer,
  Question,
  questions,
  recordAnswer,
  shouldAutoSubmit,
  practiceSpeechTexts,
} from "./core/learning";
import { speechWord, Mode } from "./core/model";
import { autoBackup, preferences, report, store, useLibrary } from "./runtime";
import { speakTexts, stopSpeech } from "./speech";
import { escapeMD } from "./components/word";
import {
  translations,
  spellingMarkdown,
  spellingDiff,
} from "./core/presentation";
import { modeSettings } from "./core/practice-settings";
import { PracticeSettings } from "./components/practice-settings";
export default function Practice() {
  return <PracticeMenu />;
}
export function PracticeMenu({ wordIds }: { wordIds?: string[] }) {
  const { lib, loading, refresh } = useLibrary(),
    { push } = useNavigation();
  const [all, setAll] = useState(false);
  const [scope, setScope] = useState<"configured" | "default" | "selected">(
    "configured",
  );
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
          <List.Dropdown.Item value="all" title="All Included Words" />
        </List.Dropdown>
      }
    >
      <List.Section
        title={`${lib.words.filter((w) => w.practice && !w.archived && (!wordIds || wordIds.includes(w.id))).length} active words included`}
      >
        {modes.map((m) => {
          const queue = questions(
            lib,
            m.mode,
            all,
            wordIds,
            scope === "configured" ? undefined : scope,
          );
          return (
            <List.Item
              key={m.mode}
              title={m.title}
              icon={m.icon}
              accessories={[{ text: `${queue.length} cards` }]}
              detail={
                <List.Item.Detail
                  markdown={`# ${m.title}\n\n${m.description}\n\n${queue.length} cards\n\n**Words:** ${(scope === "configured" ? modeSettings(lib, m.mode).scope : scope) === "selected" ? "Selected words only" : "Default library"}\n\n**Auto pronunciation:** ${modeSettings(lib, m.mode).autoSpeak ? "On" : "Off"}`}
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Start Practice"
                    icon={Icon.Play}
                    onAction={() => {
                      if (!queue.length) {
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
                          autoSpeak={modeSettings(lib, m.mode).autoSpeak}
                          onFinished={refresh}
                        />,
                      );
                    }}
                  />
                  <ActionPanel.Submenu title="Word Selection">
                    <Action
                      title="Use Mode Setting"
                      onAction={() => setScope("configured")}
                    />
                    <Action
                      title="Use Default Library"
                      onAction={() => setScope("default")}
                    />
                    <Action
                      title="Use Selected Words Only"
                      onAction={() => setScope("selected")}
                    />
                  </ActionPanel.Submenu>
                  <Action
                    title="Configure Practice Modes"
                    onAction={() =>
                      push(<PracticeSettings onSaved={refresh} />)
                    }
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
function PracticeSession({
  queue,
  autoSpeak,
  onFinished,
}: {
  queue: Question[];
  autoSpeak: boolean;
  onFinished: () => Promise<void>;
}) {
  const [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<{ correct: boolean; rating: number }[]>(
      [],
    ),
    [selected, setSelected] = useState(queue[0]?.id);
  const saved = useRef(new Set<string>());
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const ending = useRef(false);
  const working = useRef(false),
    { pop } = useNavigation();
  const q = queue[index],
    done = index >= queue.length,
    copy = q?.mode === "copy";
  useEffect(() => {
    stopSpeech();
    if (q && autoSpeak)
      void speakTexts(practiceSpeechTexts(q, false)).catch(report);
    return () => stopSpeech();
  }, [q, autoSpeak]);
  const finish = async () => {
    if (ending.current) return;
    ending.current = true;
    stopSpeech();
    try {
      await pending.current;
      await autoBackup();
      await onFinished();
      pop();
    } catch (error) {
      await report(error);
    } finally {
      ending.current = false;
    }
  };
  const submit = async (
    rating: Grade,
    explicitAnswer?: string,
    advance = true,
  ) => {
    if (!q || working.current || ending.current) return;
    working.current = true;
    setBusy(true);
    const value = explicitAnswer ?? answer;
    const checked = checkAnswer(value, q.expected);
    const correct = q.mode === "meaning" ? rating !== 1 : checked.correct;
    // Input errors cannot be scored Good/Easy, and copying never updates FSRS.
    const grade: Grade = q.mode !== "meaning" && !correct ? 1 : rating;
    try {
      if (!saved.current.has(q.id)) {
        pending.current = store.mutate((l) =>
          recordAnswer(l, q, grade, value, correct),
        );
        await pending.current;
        void autoBackup();
        saved.current.add(q.id);
        setResults((r) => [...r, { correct, rating: grade }]);
      }
      if (!advance) return;
      setIndex((i) => i + 1);
      setSelected(queue[index + 1]?.id);
      setAnswer("");
      setRevealed(false);
      stopSpeech();
      if (index + 1 === queue.length) {
        await autoBackup();
        await onFinished();
      }
    } catch (e) {
      pending.current = Promise.resolve();
      await report(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  if (done)
    return (
      <List navigationTitle="Practice Complete" isShowingDetail>
        <List.Item
          title="Session Complete"
          icon={Icon.CheckCircle}
          detail={
            <List.Item.Detail
              markdown={`# ✓ ${results.filter((r) => r.correct).length} / ${results.length}`}
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
  const language = preferences().languageMode;
  const meanings = q.word.senses
    .map((s) => translations(s, language))
    .filter(Boolean)
    .join("\n\n");
  const prompt = isInput
    ? spellingMarkdown(q.word, q.expected, answer, revealed, language, copy)
    : q.mode === "gender"
      ? `# ${escapeMD(q.word.word)}\n\n${translations(q.sense, language)}\n\n⌘1 **un**　⌘2 **une**`
      : `# ${escapeMD(q.word.word)}`;
  const feedback = !revealed
    ? ""
    : q.mode === "meaning"
      ? `\n\n${meanings}`
      : q.mode === "gender"
        ? `\n\n${spellingDiff(`${answer === "m" ? "un" : "une"} ${speechWord(q.word)}`, `${q.sense.gender === "m" ? "un" : "une"} ${speechWord(q.word)}`)}`
        : "";
  const actions = (
    <ActionPanel>
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
              void submit(3);
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
          onAction={() => setRevealed(true)}
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
        (q.mode === "meaning" ? (
          <>
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
          </>
        ) : (
          <>
            <Action
              title={
                checkAnswer(answer, q.expected).correct
                  ? "Continue"
                  : "Continue after Mistake"
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
      {revealed && (
        <Action.OpenInBrowser
          title="Look Up in Frdic"
          url={`eudic-fr://dict/${encodeURIComponent(speechWord(q.word))}`}
        />
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
      isShowingDetail
      searchText={answer}
      onSearchTextChange={(v) => {
        if (!revealed && isInput && !working.current && !ending.current) {
          setAnswer(v);
          if (shouldAutoSubmit(v, q.expected)) void submit(3, v);
        }
      }}
      searchBarPlaceholder={isInput ? "Type spelling…" : ""}
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (id) setSelected(id);
      }}
      navigationTitle={`${q.mode} · ${index + 1} / ${queue.length}`}
      actions={actions}
    >
      {queue.map((item, i) => (
        <List.Item
          key={item.id}
          id={item.id}
          title={q.mode !== "spelling" ? item.word.word : `${i + 1}`}
          icon={
            i < index
              ? Icon.CheckCircle
              : i === index
                ? Icon.ArrowRight
                : Icon.Circle
          }
          detail={
            <List.Item.Detail markdown={i === index ? prompt + feedback : ""} />
          }
          actions={
            i === index ? (
              actions
            ) : (
              <ActionPanel>
                <Action
                  title="Return to Current Question"
                  onAction={() => setSelected(q.id)}
                />
                <Action
                  title="End Session"
                  shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                  onAction={finish}
                />
              </ActionPanel>
            )
          }
        />
      ))}
    </List>
  );
}
