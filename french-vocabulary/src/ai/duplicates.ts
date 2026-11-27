import { Word, canonical } from "../core/model";
import type { Candidate, Task } from "./core";
import { familyMatchKey } from "./family";

const key = (s: string) => canonical(s).toLocaleLowerCase("fr");
// Compare AI lemmas to known local annotations without rewriting stored spellings.
function senseHeadwordKey(spelling: string) {
  return key(spelling)
    .replace(/’/g, "'")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+\(/g, "(");
}

function senseLemma(spelling: string) {
  const reflexive = spelling.match(/^([\p{L}\p{M}-]+)\((se|s')\)$/u);
  if (reflexive) return (reflexive[2] === "se" ? "se " : "s'") + reflexive[1];
  const base = spelling
    .replace(/^([\p{L}\p{M}-]+)\((?:à|de)(?:\s*\+\s*inf\.?)?\)$/u, "$1")
    .replace(/f\(ve\)$/u, "f")
    .replace(/er\(ère\)$/u, "er")
    .replace(/\((?:le|les)\)$/u, "");
  return familyMatchKey(base);
}

export function sameSenseHeadword(left: string, right: string) {
  const a = senseHeadwordKey(left);
  const b = senseHeadwordKey(right);
  // Compare a known annotation to a plain lemma, not two distinct constructions.
  return (
    a === b ||
    (!/[(),，]/u.test(b) && senseLemma(a) === b) ||
    (!/[(),，]/u.test(a) && senseLemma(b) === a)
  );
}

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
    !sameSenseHeadword(c.headword, word.word)
  )
    return undefined;
  const senses = word?.senses ?? [];
  const exact = rows.find((r) =>
    task === "senses"
      ? key(r.pos) === key(c.pos ?? "") &&
        key(senses[Number(r.ref)].zh) === key(c.zh ?? "") &&
        key(senses[Number(r.ref)].en) === key(c.en ?? "")
      : task === "collocations"
        ? key(r.pattern) === key(c.pattern ?? "")
        : task === "examples"
          ? key(r.french) === key(c.french ?? "")
          : false,
  );
  const advised = ["equivalent", "overlap"].includes(c.match ?? "")
    ? rows.find((r) => r.ref === c.existingRef)
    : undefined;
  const sameChinese =
    task === "senses" && c.zh?.trim()
      ? rows.filter(
          (r) =>
            key(r.pos) === key(c.pos ?? "") &&
            key(senses[Number(r.ref)].zh) === key(c.zh ?? ""),
        )
      : [];
  const row =
    exact ?? advised ?? (sameChinese.length === 1 ? sameChinese[0] : undefined);
  if (!row) return undefined;
  // A different POS cannot be silently treated as the same sense.
  const status = exact
    ? "equivalent"
    : !advised || (task === "senses" && key(row.pos) !== key(c.pos ?? ""))
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
