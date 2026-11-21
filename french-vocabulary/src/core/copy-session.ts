import type { Question } from "./learning";
export function compactCopyQueue(queue: Question[]) {
  return queue.map((q) => ({
    id: q.id,
    wordId: q.word.id,
    expected: q.expected,
  }));
}
export function practiceWindow(index: number, length: number) {
  return { start: Math.max(0, index - 20), end: Math.min(length, index + 60) };
}
