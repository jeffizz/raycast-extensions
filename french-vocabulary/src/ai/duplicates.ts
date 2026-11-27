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

export function existingForSense<T extends { senseId?: string }>(
  entries: readonly T[],
  senseId?: string,
) {
  if (!senseId) return entries.filter((entry) => !entry.senseId);
  return [
    ...entries.filter((entry) => entry.senseId === senseId),
    ...entries.filter((entry) => !entry.senseId),
  ];
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
        ? existingForSense(word.collocationEntries ?? [], senseId).map((e) => ({
            pattern: e.pattern,
            meaning: e.meaning,
          }))
        : task === "examples"
          ? existingForSense(word.examples, senseId).map((e) => ({
              french: e.french,
              translation: e.translation,
            }))
          : task === "mnemonic" && word.mnemonic?.trim()
            ? [{ text: word.mnemonic }]
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
export function generationInput(
  spelling: string,
  word: Word | undefined,
  task: Task,
  senseId: string,
  searchSources: boolean,
) {
  const senses = word?.senses
    .filter((sense) => task === "senses" || sense.id === senseId)
    .map(({ pos, zh, en }) => ({ pos, zh, en }));
  if (task === "examples" || task === "collocations")
    return JSON.stringify({ word: spelling, senses });
  return JSON.stringify({
    word: spelling,
    existingContent:
      task === "mnemonic" && searchSources
        ? []
        : duplicateContext(word, task, senseId),
    senses,
  });
}

const phraseKey = (value: string) =>
  key(value)
    .replace(/[’‘]/g, "'")
    .replace(/\s*([.!?。！？]+)$/u, "")
    .trim();

const patternKey = (value: string) =>
  phraseKey(value)
    .replace(/\bquelque chose\b/gu, "qch")
    .replace(/\bquelqu'un\b/gu, "qn")
    .replace(/\binfinitif\b/gu, "inf")
    .replace(/\s*\+\s*/gu, " ");

function localUsageMatch(
  c: Candidate,
  word: Word | undefined,
  task: "examples" | "collocations",
  senseId?: string,
) {
  if (!word) return;
  const examples = task === "examples";
  const normalize = examples ? phraseKey : patternKey;
  const target = normalize((examples ? c.french : c.pattern) ?? "");
  if (!target) return;
  const gloss = phraseKey((examples ? c.translation : c.meaning) ?? "");
  const rows = examples
    ? existingForSense(word.examples, senseId).map((e) => ({
        phrase: e.french,
        gloss: e.translation,
        preposition: "",
      }))
    : existingForSense(word.collocationEntries ?? [], senseId).map((e) => ({
        phrase: e.pattern,
        gloss: e.meaning,
        preposition: e.preposition ?? "",
      }));
  let overlap:
    | { status: "overlap"; senseId?: undefined; ref: string; summary: string }
    | undefined;
  for (const [index, row] of rows.entries()) {
    const samePhrase = normalize(row.phrase) === target;
    const conflictingPreposition =
      !examples &&
      row.preposition.trim() &&
      c.preposition?.trim() &&
      key(row.preposition) !== key(c.preposition);
    const match = {
      senseId: undefined,
      ref: String(index),
      summary: [row.phrase, row.gloss].filter(Boolean).join(" · "),
    };
    if (samePhrase && !conflictingPreposition)
      return { ...match, status: "equivalent" as const };
    if (samePhrase || (gloss && phraseKey(row.gloss) === gloss))
      overlap ??= { ...match, status: "overlap" };
  }
  return overlap;
}

export function candidateMatch(
  c: Candidate,
  word: Word | undefined,
  task: Task,
  senseId?: string,
) {
  if (task === "examples" || task === "collocations")
    return localUsageMatch(c, word, task, senseId);
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
      : task === "mnemonic" &&
        !!word?.mnemonic?.trim() &&
        key(word.mnemonic) === key(c.text ?? ""),
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
