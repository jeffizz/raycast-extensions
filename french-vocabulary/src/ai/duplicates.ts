import { Word, canonical } from "../core/model";
import { Candidate, Task } from "./core";

const key = (s: string) => canonical(s).toLocaleLowerCase("fr");
export function duplicateContext(
  word: Word | undefined,
  task: Task,
  senseId?: string,
) {
  if (!word) return [];
  const rows =
    task === "senses"
      ? word.senses.map((s) => ({ pos: s.pos, zh: s.zh, en: s.en }))
      : task === "collocations"
        ? (word.collocationEntries ?? [])
            .filter((e) => e.senseId === senseId)
            .map((e) => ({ pattern: e.pattern, meaning: e.meaning }))
        : task === "examples"
          ? word.examples
              .filter((e) => e.senseId === senseId)
              .map((e) => ({ french: e.french, translation: e.translation }))
          : [];
  // Temporary indices refer only to this bounded snapshot, never library IDs.
  return rows
    .slice(0, 32)
    .map((row, i) =>
      Object.fromEntries([
        ["ref", String(i)],
        ...Object.entries(row).map(([k, v]) => [k, v.slice(0, 240)]),
      ]),
    );
}
export function candidateMatch(
  c: Candidate,
  word: Word | undefined,
  task: Task,
  senseId?: string,
) {
  const rows = duplicateContext(word, task, senseId);
  if (
    task === "senses" &&
    c.headword &&
    word &&
    key(c.headword) !== key(word.word)
  )
    return undefined;
  const exact = rows.find((r) =>
    task === "senses"
      ? key(r.pos) === key(c.pos ?? "") &&
        key(r.zh) === key(c.zh ?? "") &&
        key(r.en) === key(c.en ?? "")
      : task === "collocations"
        ? key(r.pattern) === key(c.pattern ?? "")
        : task === "examples"
          ? key(r.french) === key(c.french ?? "")
          : false,
  );
  const row = exact ?? rows.find((r) => r.ref === c.existingRef);
  if (!row || (!exact && !["equivalent", "overlap"].includes(c.match ?? "")))
    return undefined;
  // A different POS cannot be silently treated as the same sense.
  const status = exact
    ? "equivalent"
    : task === "senses" && key(row.pos) !== key(c.pos ?? "")
      ? "overlap"
      : c.match!;
  return {
    status,
    ref: row.ref,
    senseId: task === "senses" ? word?.senses[Number(row.ref)]?.id : undefined,
    summary: Object.entries(row)
      .filter(([k]) => k !== "ref")
      .map(([, v]) => v)
      .join(" · "),
  };
}
