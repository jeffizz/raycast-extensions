import hList from "./h-aspire.json";
import rawBook from "./verbs.json";
import type { VerbBook } from "./model";

export const book = rawBook as VerbBook;
export const hAspire = new Set<string>(hList);

export function randomVerb(pool: "common" | "all") {
  const list = pool === "common" ? book.common : Object.keys(book.verbs);
  return list[Math.floor(Math.random() * list.length)] ?? "être";
}
