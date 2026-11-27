import type { Word } from "../core/model";

export const CHAT_HISTORY_WINDOWS = [0, 1, 3, 5, 7, 9] as const;
export const DEFAULT_CHAT_HISTORY_WINDOW = 3;
export const MAX_CHAT_HISTORY_WINDOW =
  CHAT_HISTORY_WINDOWS.at(-1) ?? DEFAULT_CHAT_HISTORY_WINDOW;
export type ChatHistoryWindow = (typeof CHAT_HISTORY_WINDOWS)[number];

export function normalizeChatHistoryWindow(value?: number): ChatHistoryWindow {
  // Round older preferences down so upgrading never sends more history.
  return (
    CHAT_HISTORY_WINDOWS.findLast(
      (window) => value !== undefined && window <= value,
    ) ?? DEFAULT_CHAT_HISTORY_WINDOW
  );
}

export type ChatTurn = {
  id: string;
  question: string;
  answer: string | null;
  sense: string;
};

export function chatContext(
  word: Word,
  senseId: string | undefined,
  question: string,
  turns: ChatTurn[],
  retrySense?: string,
  historyWindow: ChatHistoryWindow = DEFAULT_CHAT_HISTORY_WINDOW,
) {
  const senses = word.senses
    .filter((sense) => !senseId || sense.id === senseId)
    .slice(0, 4)
    .map(({ pos, zh, en }) => ({
      pos: pos.slice(0, 100),
      zh: zh.slice(0, 250),
      en: en.slice(0, 250),
    }));
  const base = {
    word: word.word.slice(0, 250),
    senses: retrySense ? undefined : senses,
    retrySense: retrySense || undefined,
    question,
  };
  const history = historyWindow
    ? turns.filter((turn) => turn.answer !== null).slice(-historyWindow)
    : [];
  const serialize = () =>
    JSON.stringify({
      ...base,
      history: history.map(({ question, answer, sense }) => ({
        question,
        answer,
        sense,
      })),
    });
  while (base.senses?.length && Buffer.byteLength(JSON.stringify(base)) > 11970)
    base.senses.pop();
  if (Buffer.byteLength(JSON.stringify(base)) > 11970)
    base.retrySense = undefined;
  while (history.length && Buffer.byteLength(serialize()) > 12000)
    history.shift();
  return { history, input: serialize() };
}
