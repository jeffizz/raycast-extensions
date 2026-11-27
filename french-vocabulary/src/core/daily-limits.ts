import type { Library, Mode } from "./model";
import type { Question } from "./learning";
export function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
}
export function dailyUsage(lib: Library, mode: Mode, date = new Date()) {
  const today = localDay(date);
  const first = new Map<string, string>();
  const reviewed = new Set<string>();
  for (const r of lib.reviews) {
    if (r.mode !== mode) continue;
    const id =
      r.wordId + ":" + mode + (mode === "gender" ? ":" + r.senseId : "");
    const day = localDay(new Date(r.at));
    if (!first.has(id) || r.at < first.get(id)!) first.set(id, r.at);
    if (day === today) reviewed.add(id);
  }
  const newToday = new Set(
    [...reviewed].filter((id) => localDay(new Date(first.get(id)!)) === today),
  );
  const reviews = new Set([...reviewed].filter((id) => !newToday.has(id)));
  return {
    newToday,
    reviews,
    newLimit: lib.settings?.practice?.[mode]?.dailyNew ?? 10,
    reviewLimit: lib.settings?.practice?.[mode]?.dailyReview ?? Infinity,
  };
}
export function limitDailyQueue(
  lib: Library,
  mode: Mode,
  queue: Question[],
  date = new Date(),
  precomputedUsage?: ReturnType<typeof dailyUsage>,
) {
  if (mode === "copy") return queue;
  const usage = precomputedUsage ?? dailyUsage(lib, mode, date);
  const cards = new Set(lib.cards.map((c) => c.id));
  let newLeft = Math.max(0, usage.newLimit - usage.newToday.size);
  let reviewLeft = Math.max(0, usage.reviewLimit - usage.reviews.size);
  const review: Question[] = [],
    fresh: Question[] = [];
  for (const q of queue) {
    const isNew = !cards.has(q.id) || usage.newToday.has(q.id);
    if (isNew) {
      if (usage.newToday.has(q.id) || newLeft-- > 0) fresh.push(q);
    } else if (usage.reviews.has(q.id) || reviewLeft-- > 0) review.push(q);
  }
  return [...review, ...fresh];
}
export function dailySummary(lib: Library, mode: Mode) {
  const u = dailyUsage(lib, mode);
  return (
    "**Today**\n\nNew: " +
    u.newToday.size +
    " / " +
    u.newLimit +
    "\n\nReview: " +
    u.reviews.size +
    " / " +
    (Number.isFinite(u.reviewLimit) ? u.reviewLimit : "Unlimited")
  );
}
