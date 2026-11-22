import type { Question } from "./learning";
export function compactCopyQueue(queue: Question[]) {
  return queue.map((q) => ({
    id: q.id,
    wordId: q.word.id,
    expected: q.expected,
  }));
}
export type SessionResult = {
  correct: boolean;
  rating: number;
  questionId?: string;
};
export function sessionRatingLabels(
  results: SessionResult[],
  savedIds: string[],
) {
  const labels = new Map<string, string>();
  const names: Record<number, string> = {
    1: "Again",
    2: "Hard",
    3: "Good",
    4: "Easy",
  };
  results.forEach((result, index) => {
    // Older progress stored results in the same insertion order as saved IDs.
    const id = result.questionId ?? savedIds[index];
    if (id && names[result.rating]) labels.set(id, names[result.rating]);
  });
  return labels;
}
export function practiceWindow(index: number, length: number) {
  return { start: Math.max(0, index - 20), end: Math.min(length, index + 60) };
}
