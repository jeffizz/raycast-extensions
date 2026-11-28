import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
} from "@raycast/api";
import { useLocalStorage, usePromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { report } from "../runtime";
import type { Word } from "../core/model";
import { md } from "../core/presentation";
import { generate, getConfig } from "./client";
import {
  CHAT_HISTORY_WINDOWS,
  DEFAULT_CHAT_HISTORY_WINDOW,
  chatContext,
  normalizeChatHistoryWindow,
  type ChatTurn,
} from "./word-chat-context";
import {
  autoBackupWordChats,
  chatLibraryId,
  wordChats,
} from "./word-chat-runtime";

const MAX_QUESTION = 1500;
const sending = new Set<string>();

export function WordChatView({
  word,
  senseId,
  switchAction,
}: {
  switchAction?: React.ReactElement;
  word: Word;
  senseId?: string;
}) {
  const [historyHidden, setHistoryHidden] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const {
    value: savedHistoryWindow,
    setValue: setHistoryWindow,
    isLoading: historyWindowLoading,
  } = useLocalStorage<number>(
    "word-chat-history-window",
    DEFAULT_CHAT_HISTORY_WINDOW,
  );
  const historyWindow = normalizeChatHistoryWindow(savedHistoryWindow);
  const [draft, setDraft] = useState("");
  const [retry, setRetry] = useState<ChatTurn>();
  const [selection, setSelection] = useState<string>();
  const replyFocus = useRef<string | undefined>(undefined);
  const [before, setBefore] = useState<number>();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const sense = word.senses.find((item) => item.id === senseId);
  const senseLabel = sense
    ? [sense.pos, sense.zh, sense.en].filter(Boolean).join(" · ").slice(0, 250)
    : "";
  const displaySense = sense ?? word.senses[0];
  const promptSense =
    retry?.sense ||
    (displaySense
      ? [displaySense.pos, displaySense.zh, displaySense.en]
          .filter(Boolean)
          .join(" · ")
      : "");
  const { data: libraryId } = usePromise(chatLibraryId);
  const { data, isLoading, revalidate } = usePromise(
    async (id: string, cursor?: number) => {
      const key = { libraryId: id, wordId: word.id };
      const [page, recent] = await Promise.all([
        wordChats.page(key, cursor),
        wordChats.page(key, undefined, true),
      ]);
      return { page, recent: recent.reverse() };
    },
    [libraryId ?? "", before],
    { execute: Boolean(libraryId) },
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    const id = replyFocus.current;
    if (
      id &&
      data?.page.some((turn) => turn.id === id && turn.answer !== null)
    ) {
      setSelection(id);
      replyFocus.current = undefined;
    }
  }, [data]);

  const backup = async (id: string) => {
    try {
      await autoBackupWordChats(id);
    } catch {
      if (mounted.current)
        await showToast({
          style: Toast.Style.Failure,
          title: "Chat saved locally",
          message:
            "WebDAV backup pending. Check Word Chat backup in Dashboard.",
        });
    }
  };
  useEffect(() => {
    if (libraryId) void backup(libraryId);
  }, [libraryId]);

  const preview = chatContext(
    word,
    retry ? undefined : sense?.id,
    draft.trim().slice(0, MAX_QUESTION),
    data?.recent ?? [],
    retry?.sense,
    historyWindow,
  );
  const included = new Set(preview.history.map((turn) => turn.id));
  const lockKey = JSON.stringify([libraryId, word.id]);
  const send = async () => {
    if (!libraryId || sending.has(lockKey) || isLoading || historyWindowLoading)
      return;
    const question = (retry?.question ?? draft).trim();
    if (!question || question.length > MAX_QUESTION) {
      await report(Error("Enter a question of 1–1,500 characters."));
      return;
    }
    sending.add(lockKey);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const key = { libraryId, wordId: word.id };
    let id: string | undefined;
    let release: (() => Promise<void>) | undefined;
    try {
      release = await wordChats.acquire(key);
      if ((await chatLibraryId()) !== libraryId)
        throw Error("Library changed. Reopen Word Chat.");
      controller.signal.throwIfAborted();
      const context = chatContext(
        word,
        retry ? undefined : sense?.id,
        question,
        data?.recent ?? [],
        retry?.sense,
        historyWindow,
      );
      if (retry && !(await wordChats.isUnanswered(key, retry.id)))
        throw Error(
          "This question is no longer awaiting a reply. Reload the chat.",
        );
      controller.signal.throwIfAborted();
      id = retry?.id ?? (await wordChats.start(key, question, senseLabel));
      if (mounted.current) {
        setDraft("");
        setRetry(undefined);
        if (!retry) setBefore(undefined);
      }
      if (mounted.current) void revalidate().catch(() => {});
      const config = await getConfig();
      controller.signal.throwIfAborted();
      const result = await generate(
        config,
        "chat",
        context.input,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const answer = result.items[0]?.text;
      if (!answer) throw Error("AI returned no answer.");
      await wordChats.finish(key, id, answer);
      replyFocus.current = id;
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) await report(error);
    } finally {
      await release?.().catch(() => {});
      if (mounted.current) {
        await revalidate().catch(() => {});
        setBusy(false);
      }
      request.current = undefined;
      sending.delete(lockKey);
      if (id) void backup(libraryId);
    }
  };
  const clear = async () => {
    if (!libraryId || sending.has(lockKey)) return;
    sending.add(lockKey);
    let release: (() => Promise<void>) | undefined;
    try {
      if (
        !(await confirmAlert({
          title: "Clear this word's chat?",
          message:
            "This removes the local conversation only, not vocabulary or progress. WebDAV backup will record the clear when enabled. Previously sent AI requests cannot be recalled.",
          primaryAction: {
            title: "Clear Chat",
            style: Alert.ActionStyle.Destructive,
          },
        }))
      )
        return;
      const key = { libraryId, wordId: word.id };
      release = await wordChats.acquire(key);
      await wordChats.clear(key);
      setDraft("");
      setRetry(undefined);
      setBefore(undefined);
      await revalidate();
      void backup(libraryId);
    } catch (error) {
      await report(error);
    } finally {
      await release?.().catch(() => {});
      sending.delete(lockKey);
    }
  };

  const actions = (turn?: ChatTurn) => (
    <ActionPanel>
      {busy ? (
        <Action
          title="Cancel Reply"
          onAction={() => request.current?.abort()}
        />
      ) : (
        <>
          {draft.trim() && (
            <Action
              title="Send Question"
              icon={Icon.ArrowRight}
              onAction={send}
            />
          )}
          {turn?.answer === null && !draft.trim() && (
            <Action
              title="Prepare Retry"
              onAction={() => {
                setRetry(turn);
                setDraft(turn.question);
              }}
            />
          )}
        </>
      )}
      <Action
        title={historyHidden ? "Show History List" : "Hide History List"}
        shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
        onAction={() => setHistoryHidden((value) => !value)}
      />
      {historyHidden && !busy && (
        <Action
          title="Ask a Question"
          onAction={() => setHistoryHidden(false)}
        />
      )}
      {turn && (
        <>
          <Action
            title={
              showQuestion
                ? "Hide Question and Sense"
                : "Show Question and Sense"
            }
            icon={showQuestion ? Icon.EyeDisabled : Icon.Eye}
            onAction={() => setShowQuestion((value) => !value)}
          />
          <Action.CopyToClipboard
            title="Copy Question"
            content={turn.question}
          />
        </>
      )}
      {turn?.answer && (
        <Action.CopyToClipboard title="Copy Answer" content={turn.answer} />
      )}
      {data?.page.length === 20 && (
        <Action
          title="Load Earlier Messages"
          onAction={() => setBefore(data.page.at(-1)?.seq)}
        />
      )}
      {before !== undefined && (
        <Action
          title="Show Latest Messages"
          onAction={() => setBefore(undefined)}
        />
      )}
      {!historyWindowLoading && !busy && (
        <ActionPanel.Submenu title={`AI History Window (${historyWindow})`}>
          {CHAT_HISTORY_WINDOWS.map((value) => (
            <Action
              key={value}
              title={
                value === 0
                  ? "No History"
                  : `Up to ${value} ${value === 1 ? "Turn" : "Turns"}`
              }
              icon={value === historyWindow ? Icon.Checkmark : undefined}
              onAction={() => setHistoryWindow(value).catch(report)}
            />
          ))}
        </ActionPanel.Submenu>
      )}
      {!busy && (data?.page.length ?? 0) > 0 && (
        <Action title="Clear Chat History" icon={Icon.Trash} onAction={clear} />
      )}
      {!busy && switchAction}
    </ActionPanel>
  );
  const turnMarkdown = (turn: ChatTurn) => {
    const answer =
      turn.answer?.replace(/!\[/g, "[") ??
      "No reply saved. Retry this question from Actions.";
    if (!showQuestion) return answer;

    const context = [word.word, ...turn.sense.split(" · ").filter(Boolean)]
      .map((part) => md(part.replace(/\s+/g, " ")))
      .join(" · ");
    return `${md(turn.question)}\n\n> ${context}\n\n---\n\n${answer}`;
  };
  const renderTurn = (turn: ChatTurn) => (
    <List.Item
      key={turn.id}
      id={turn.id}
      title={turn.question.replace(/\s+/g, " ")}
      subtitle={turn.answer === null ? "Unanswered · Not Sent" : undefined}
      actions={actions(turn)}
      detail={<List.Item.Detail markdown={turnMarkdown(turn)} />}
    />
  );
  const page = data?.page ?? [];
  const contextEnd = page.findLastIndex((turn) => included.has(turn.id)) + 1;
  const context = page.slice(0, contextEnd);
  const local = page.slice(contextEnd);
  const currentReply = page.find(
    (turn) => turn.id === replyFocus.current && turn.answer !== null,
  );
  const selectedId =
    currentReply?.id ??
    (page.some((turn) => turn.id === selection) ? selection : page[0]?.id);
  if (historyHidden) {
    const turn = page.find((item) => item.id === selectedId);
    return (
      <Detail
        navigationTitle={`Word Chat · ${word.word}`}
        isLoading={!libraryId || isLoading || busy}
        markdown={
          turn
            ? turnMarkdown(turn)
            : `# ${md(word.word)}\n\nNo question selected. Show the history list to browse or ask a question.`
        }
        actions={actions(turn)}
      />
    );
  }
  return (
    <List
      navigationTitle={`Word Chat · ${word.word}`}
      isShowingDetail
      isLoading={!libraryId || isLoading || busy}
      filtering={false}
      searchText={draft}
      selectedItemId={selectedId}
      onSelectionChange={(id) => {
        if (id) setSelection(id);
      }}
      onSearchTextChange={(value) => {
        if (value !== draft) {
          setRetry(undefined);
          setDraft(value);
        }
      }}
      searchBarPlaceholder={`Ask a question about ${word.word}${promptSense ? " · " + promptSense : ""}`}
      actions={actions()}
    >
      <List.EmptyView
        title={before === undefined ? "No Chat History" : "No Earlier Messages"}
        description="Type a question in the search bar and press Return to send."
        actions={actions()}
      />
      <List.Section
        title={`Next request context · ${included.size} / ${historyWindow} complete turns`}
      >
        {context.map(renderTurn)}
      </List.Section>
      <List.Section title="Local history · not sent with the next question">
        {local.map(renderTurn)}
      </List.Section>
    </List>
  );
}
