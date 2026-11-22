import { Library, searchKey, Word } from "./model";

export type ReinforcementTask = { wordId: string; others: string[] };
export type ReinforcementState = {
  libraryId: string;
  tasks: ReinforcementTask[];
  gap: number;
};
export type Choice = { wordId: string; word: string; meaning: string };
export function reinforcementState(
  lib: Library,
  saved?: ReinforcementState,
): ReinforcementState {
  return saved?.libraryId === lib.libraryId
    ? structuredClone(saved)
    : { libraryId: lib.libraryId, tasks: [], gap: 3 };
}
export function reinforceAfterRecall(
  state: ReinforcementState,
  wordId: string,
  again: boolean,
) {
  const next = structuredClone(state);
  next.gap = Math.min(3, next.gap + 1);
  for (const task of next.tasks)
    if (task.wordId !== wordId && !task.others.includes(wordId))
      task.others.push(wordId);
  if (again) {
    next.tasks = next.tasks.filter((t) => t.wordId !== wordId);
    next.tasks.push({ wordId, others: [] });
  }
  return next;
}
export function reinforceAfterChoice(
  state: ReinforcementState,
  wordId: string,
  correct: boolean,
) {
  const next = structuredClone(state);
  next.tasks = next.tasks.filter((t) => t.wordId !== wordId);
  if (!correct) next.tasks.push({ wordId, others: [] });
  next.gap = 0;
  return next;
}
function normalized(value: string) {
  return searchKey(value).replace(/[\p{P}\p{Z}\s]/gu, "");
}
function meanings(word: Word, english: boolean) {
  return word.senses
    .flatMap((s) => (english ? s.en : s.zh).split(/[;；\n]/))
    .map(normalized)
    .filter(Boolean);
}
function overlaps(a: string[], b: string[]) {
  return a.some((x) =>
    b.some((y) => x === y || x.includes(y) || y.includes(x)),
  );
}
export function reinforcementChoices(
  lib: Library,
  word: Word,
  english: boolean,
  random = Math.random,
): Choice[] | undefined {
  const sense = word.senses.find((s) => (english ? s.en : s.zh).trim());
  if (!sense) return;
  const text = (w: Word) =>
    w.senses.find((s) => (english ? s.en : s.zh).trim());
  const linked = new Set(
    lib.groups
      .filter((g) => g.wordIds.includes(word.id))
      .flatMap((g) => g.wordIds),
  );
  const peers = new Set(
    (lib.settings?.collections ?? [])
      .filter((c) => c.wordIds.includes(word.id))
      .flatMap((c) => c.wordIds),
  );
  const candidates = lib.words
    .filter(
      (w) =>
        w.id !== word.id &&
        !w.archived &&
        w.practice &&
        text(w)?.pos === sense.pos,
    )
    .map((w) => ({
      w,
      rank: linked.has(w.id) ? 0 : peers.has(w.id) ? 1 : 2,
      tie: random(),
    }))
    .sort((a, b) => a.rank - b.rank || a.tie - b.tie);
  const selected = [word];
  for (const { w } of candidates) {
    if (
      selected.some((other) =>
        overlaps(meanings(other, english), meanings(w, english)),
      )
    )
      continue;
    selected.push(w);
    if (selected.length === 4) break;
  }
  if (selected.length !== 4) return;
  const result = selected.map((w) => ({
    wordId: w.id,
    word: w.word,
    meaning: english ? text(w)!.en : text(w)!.zh,
  }));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
