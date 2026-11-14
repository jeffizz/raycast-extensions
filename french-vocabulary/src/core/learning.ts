import { createEmptyCard, fsrs, CardInput, Grade } from "ts-fsrs";
import {
  Library,
  Mode,
  Word,
  Sense,
  canonical,
  searchKey,
  uid,
  now,
  speechWord,
  mnemonicPhrases,
} from "./model";
import { modeIncludes } from "./practice-settings";
export type Question = {
  id: string;
  word: Word;
  sense: Sense;
  mode: Mode;
  due: number;
  expected: string;
};
export function questions(
  lib: Library,
  mode: Mode,
  all = false,
  wordIds?: string[],
  scope?: "default" | "selected",
): Question[] {
  const result: Question[] = [];
  for (const w of lib.words.filter(
    (w) => !w.archived && w.practice && (!wordIds || wordIds.includes(w.id)) && modeIncludes(lib, mode, w.id, scope),
  )) {
    const expected = speechWord(w);
    for (const s of mode === "gender" ? w.senses : w.senses.slice(0, 1)) {
      if (
        mode === "gender" &&
        (!/(?:^|[ /])n\./i.test(s.pos) || !["m", "f"].includes(s.gender))
      )
        continue;
      if ((mode === "copy" || mode === "spelling") && !expected) continue;
      if (mode === "spelling" && !w.senses.some((s) => s.en || s.zh)) continue;
      const id = `${w.id}:${mode}${mode === "gender" ? `:${s.id}` : ""}`;
      const c = lib.cards.find((c) => c.id === id);
      const due = c ? Date.parse(String(c.card.due)) : 0;
      if (mode === "copy" || all || due <= Date.now())
        result.push({
          id,
          word: w,
          sense: s,
          mode,
          due,
          expected: mode === "gender" ? s.gender : expected || w.word,
        });
    }
  }
  return result.sort(
    (a, b) => a.due - b.due || a.word.word.localeCompare(b.word.word, "fr"),
  );
}
export function recordAnswer(
  lib: Library,
  q: Question,
  rating: Grade,
  answer: string,
  correct: boolean,
) {
  const w = lib.words.find((w) => w.id === q.word.id);
  if (!w || w.archived || !w.practice)
    throw Error("This word is no longer active in the practice library.");
  const at = now();
  w.updatedAt = at;
  let log: unknown;
  if (q.mode !== "copy") {
    const existing = lib.cards.find((c) => c.id === q.id);
    const card = existing?.card ?? createEmptyCard(new Date());
    const result = fsrs({ enable_fuzz: false }).repeat(
      card as unknown as CardInput,
      new Date(),
    )[rating];
    const serialized = JSON.parse(JSON.stringify(result.card));
    log = JSON.parse(JSON.stringify(result.log));
    if (existing) existing.card = serialized;
    else
      lib.cards.push({
        id: q.id,
        wordId: w.id,
        senseId: q.mode === "gender" ? q.sense.id : undefined,
        mode: q.mode,
        card: serialized,
      });
  }
  lib.reviews.push({
    id: uid(),
    wordId: w.id,
    senseId: q.mode === "gender" ? q.sense.id : undefined,
    mode: q.mode,
    at,
    rating,
    answer,
    correct,
    expected: q.expected,
    log,
  });
}
export function shouldAutoSubmit(answer: string, expected: string) {
  return !!answer && answer.normalize("NFC") === expected.normalize("NFC");
}
export function practiceSpeechTexts(q: Question, revealed: boolean) {
  const word = speechWord(q.word);
  return q.mode === "gender" && !revealed
    ? [word]
    : [word, ...mnemonicPhrases(q.word)];
}
export function checkAnswer(answer: string, expected: string) {
  const a = canonical(answer),
    b = canonical(expected);
  return {
    correct: a === b,
    accentOnly: a !== b && searchKey(a) === searchKey(b),
  };
}
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = old;
    }
  }
  return row[b.length];
}
function grams(s: string) {
  return new Set(
    Array.from({ length: Math.max(0, s.length - 1) }, (_, i) =>
      s.slice(i, i + 2),
    ),
  );
}
export function similarity(a: string, b: string) {
  a = searchKey(a);
  b = searchKey(b);
  const x = grams(a),
    y = grams(b);
  const overlap = [...x].filter((g) => y.has(g)).length;
  const dice = (2 * overlap) / Math.max(1, x.size + y.size);
  const edit = 1 - distance(a, b) / Math.max(1, a.length, b.length);
  const contained = a.includes(b) || b.includes(a) ? 0.15 : 0;
  return Math.min(1, 0.5 * dice + 0.5 * edit + contained);
}
export function similarWords(lib: Library, w: Word) {
  const linked = new Set(
    lib.groups
      .filter((g) => g.wordIds.includes(w.id))
      .flatMap((g) => g.wordIds),
  );
  return lib.words
    .filter((x) => x.id !== w.id && !x.archived)
    .map((word) => ({
      word,
      score: similarity(w.word, word.word),
      linked: linked.has(word.id),
    }))
    .filter((x) => x.linked || x.score >= 0.5)
    .sort((a, b) => Number(b.linked) - Number(a.linked) || b.score - a.score)
    .slice(0, 40);
}
export function mistakes(lib: Library, id: string) {
  const r = lib.reviews.filter((r) => r.wordId === id && r.mode !== "copy");
  return { total: r.length, wrong: r.filter((r) => !r.correct).length };
}
