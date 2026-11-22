import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { Choice } from "../core/reinforcement";
import { report } from "../runtime";

export function ReinforcementQuestion({
  word,
  correctId,
  onEnd,
  choices,
  onAnswer,
  onContinue,
}: {
  word: string;
  correctId: string;
  onEnd: () => Promise<void>;
  choices: Choice[];
  onAnswer: (choice: Choice) => Promise<void>;
  onContinue: () => void;
}) {
  const [picked, setPicked] = useState<Choice>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [rowsReady, setRowsReady] = useState(false);
  const awaitingHeader = useRef(true);
  useEffect(() => {
    // Send a selection update after the native list has mounted.
    setSelected("question");
  }, []);
  const lock = useRef(false);
  const select = async (choice: Choice) => {
    if (lock.current || picked) return;
    lock.current = true;
    setBusy(true);
    try {
      await onAnswer(choice);
      setPicked(choice);
      setSelected("question");
    } catch (error) {
      await report(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const instructions = async () => {
    await showToast({
      style: Toast.Style.Success,
      title: "Choose with ⌘1–4",
      message:
        "Use ⌘1–4, Actions, or move to an option and press Return. Moving selection alone does not answer.",
    });
  };
  const selectedChoice = choices.find((c) => "option-" + c.wordId === selected);
  const actions = (
    <ActionPanel>
      {picked ? (
        <Action title="Continue" onAction={onContinue} />
      ) : (
        <>
          <Action
            title={
              selectedChoice ? "Submit Selected Answer" : "Choose with ⌘1–4"
            }
            onAction={() =>
              selectedChoice ? select(selectedChoice) : instructions()
            }
          />
          <Action title="Answering Instructions" onAction={instructions} />
          <ActionPanel.Section title="Choose an Answer">
            {(rowsReady ? choices : []).map((c, i) => (
              <Action
                key={c.wordId}
                title={"Choose " + "ABCD"[i]}
                shortcut={{
                  modifiers: ["cmd"],
                  key: String(i + 1) as "1" | "2" | "3" | "4",
                }}
                onAction={() => select(c)}
              />
            ))}
          </ActionPanel.Section>
        </>
      )}
      <Action
        title="End Session"
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
        onAction={onEnd}
      />
    </ActionPanel>
  );
  return (
    <List
      isLoading={busy}
      filtering={false}
      isShowingDetail={false}
      searchText=""
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (!id) return;
        if (awaitingHeader.current) {
          if (id !== "question") return;
          awaitingHeader.current = false;
          setRowsReady(true);
          return;
        }
        setSelected(id);
      }}
      searchBarPlaceholder={
        picked
          ? "Press Return to continue · Not graded"
          : "Choose with ⌘1–4 or Actions, or select an option and press Return"
      }
      navigationTitle="Multiple Choice · Not Graded"
      actions={actions}
    >
      <List.Item
        id="question"
        title={word}
        icon={
          picked
            ? picked.wordId === correctId
              ? Icon.CheckCircle
              : Icon.XMarkCircle
            : Icon.QuestionMark
        }
        subtitle={
          picked
            ? picked.wordId === correctId
              ? "Correct · Not Graded"
              : "Incorrect · Not Graded"
            : "Multiple Choice · Not Graded"
        }
        actions={actions}
      />
      {(rowsReady ? choices : []).map((c, i) => (
        <List.Item
          key={c.wordId}
          id={"option-" + c.wordId}
          title={"ABCD"[i] + ". " + c.meaning}
          subtitle={picked ? c.word : undefined}
          accessories={
            picked
              ? [
                  ...(c.wordId === correctId
                    ? [{ text: "Correct Answer" }]
                    : []),
                  ...(c.wordId === picked.wordId
                    ? [{ text: "Your Answer" }]
                    : []),
                ]
              : []
          }
          icon={
            picked && c.wordId === correctId
              ? Icon.CheckCircle
              : picked && c.wordId === picked.wordId
                ? Icon.XMarkCircle
                : undefined
          }
          actions={actions}
        />
      ))}
    </List>
  );
}
