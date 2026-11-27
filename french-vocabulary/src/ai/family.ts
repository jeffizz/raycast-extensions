import {
  canonical,
  isNoun,
  Sense,
  ContentSource,
  Library,
  newWord,
  now,
  Word,
} from "../core/model";
import { Candidate, candidateSense, safeVocabulary } from "./core";

export const familyKey = (word: string) =>
  canonical(word).toLocaleLowerCase("fr");
// Explicit irregular full forms only; arbitrary parenthetical text is not a variant.
const fullFamilyVariants: Readonly<Record<string, readonly string[]>> = {
  nouveau: ["nouvelle", "nouvel"],
  beau: ["belle", "bel"],
  vieux: ["vieille", "vieil"],
  fou: ["folle", "fol"],
  mou: ["molle", "mol"],
};
// Matching only: never rewrite imported spellings or generate all inflected forms.
export function familyMatchKey(word: string) {
  const exact = familyKey(word);
  if (!/[（(,，]/u.test(exact)) return exact;
  const annotated = exact.replace(/（/g, "(").replace(/）/g, ")");
  const reflexive = annotated.match(/^([\p{L}\p{M}-]+)\s*\((se|s')\)$/u);
  if (reflexive) {
    const [, verb, marker] = reflexive;
    return marker === "se" ? `se ${verb}` : `s'${verb}`;
  }
  const base = annotated
    .replace(
      /^([\p{L}\p{M}]+)((?:\([\p{L}\p{M}]+\))+)(?=(?:[,，]\s*(?:es|e|s))*$)/u,
      (annotation, head: string, forms: string) => {
        const variants = forms.slice(1, -1).split(")(");
        return variants.every(
          (form) =>
            fullFamilyVariants[head]?.includes(form) ||
            ["e", "s", "es"].includes(form) ||
            (/f$/u.test(head) && ["ve", "ves"].includes(form)) ||
            (/l$/u.test(head) && ["le", "les"].includes(form)) ||
            (/er$/u.test(head) && ["ère", "ères"].includes(form)),
        )
          ? head
          : annotation;
      },
    )
    .replace(/\((?:e|es|s)\)(?=\(|[,，]|\s|$)/gu, "")
    .replace(/(?:[,，]\s*(?:es|e|s))+$/u, "");
  return /[(),，（）]/u.test(base) ? exact : base;
}
export function familyMatchBatch(lib: Library, headwords: string[]) {
  // The map contains only requested candidates and matching Word references.
  // No whole-library index, cloned words, persistent cache, or inflection expansion.
  const matches = new Map<string, Word[]>();
  for (const headword of headwords) matches.set(familyMatchKey(headword), []);
  if (!matches.size) return matches;
  for (const word of lib.words) {
    const bucket = matches.get(familyMatchKey(word.word));
    if (bucket) bucket.push(word);
  }
  return matches;
}
export function familyMatches(lib: Library, headword: string) {
  return familyMatchBatch(lib, [headword]).get(familyMatchKey(headword)) ?? [];
}
function familyPOS(pos: string) {
  const value = canonical(pos).toLocaleLowerCase("fr");
  if (isNoun(value)) return "noun";
  if (/^adj(?:\.|\b)/u.test(value)) return "adjective";
  if (/^v(?:\.|\b)/u.test(value)) return "verb";
  if (/^pr[ée]p(?:\.|\b)/u.test(value)) return "preposition";
  return value;
}
export function compatibleFamilySenses(word: Word, pos: string): Sense[] {
  return word.senses.filter((s) => familyPOS(s.pos) === familyPOS(pos));
}
export function familyRelations(lib: Library, wordId: string, senseId: string) {
  const rows: { word: Word; senseId?: string; description: string }[] = [];
  for (const owner of lib.words)
    for (const link of owner.familyLinks ?? []) {
      if (owner.id === wordId && link.senseId === senseId) {
        const target = lib.words.find((w) => w.id === link.targetWordId);
        if (
          target &&
          (!link.targetSenseId ||
            target.senses.some((s) => s.id === link.targetSenseId))
        )
          rows.push({
            word: target,
            senseId: link.targetSenseId,
            description: link.description,
          });
      } else if (
        link.targetWordId === wordId &&
        (!link.targetSenseId || link.targetSenseId === senseId)
      ) {
        if (owner.senses.some((s) => s.id === link.senseId))
          rows.push({
            word: owner,
            senseId: link.senseId,
            description: link.description,
          });
      }
    }
  return rows.filter(
    (row, i) =>
      rows.findIndex(
        (r) => r.word.id === row.word.id && r.senseId === row.senseId,
      ) === i,
  );
}
export type FamilySelection = {
  candidate: Candidate;
  existingId?: string;
  targetSenseId?: string;
};
export function saveFamily(
  lib: Library,
  before: Word,
  senseId: string,
  selections: FamilySelection[],
  source: ContentSource,
) {
  const word = lib.words.find((w) => w.id === before.id);
  if (
    !word ||
    JSON.stringify(word.senses.find((s) => s.id === senseId)) !==
      JSON.stringify(before.senses.find((s) => s.id === senseId)) ||
    !word.senses.some((s) => s.id === senseId)
  )
    throw Error("Source sense changed. Reopen Word Family.");
  if (!selections.length) throw Error("Select at least one candidate.");
  // Only words created in this save may receive additional candidate senses.
  const created = new Map<string, Word>();
  const matchBatch = familyMatchBatch(
    lib,
    selections.map((s) => s.candidate.headword ?? ""),
  );
  for (const { candidate: c, existingId, targetSenseId } of selections) {
    if (!c.headword || !safeVocabulary(c.headword) || !c.text)
      throw Error("Invalid family candidate.");
    if (familyMatchKey(c.headword) === familyMatchKey(word.word))
      throw Error("A word cannot link to itself.");
    const matches = matchBatch.get(familyMatchKey(c.headword)) ?? [];
    let target: Word;
    let targetSense = targetSenseId;
    if (existingId) {
      const found = matches.find((w) => w.id === existingId);
      if (!found) throw Error("Existing word changed. Refresh candidates.");
      target = found;
      if (
        !targetSense ||
        !compatibleFamilySenses(target, c.pos ?? "").some(
          (s) => s.id === targetSense,
        )
      )
        throw Error(
          "Choose an existing sense with the matching part of speech. Refresh candidates if it changed.",
        );
    } else {
      const batchWord = created.get(familyMatchKey(c.headword));
      if (matches.length && !batchWord)
        throw Error(
          "Word now exists. Refresh candidates to link it without adding senses.",
        );
      const sense = { ...candidateSense(c), source };
      if (batchWord) {
        target = batchWord;
        const duplicate = target.senses.find(
          (s) => s.pos === sense.pos && s.zh === sense.zh && s.en === sense.en,
        );
        if (!duplicate) target.senses.push(sense);
        targetSense = duplicate?.id ?? sense.id;
      } else {
        target = newWord(c.headword, sense);
        targetSense = sense.id;
        lib.words.push(target);
        created.set(familyMatchKey(c.headword), target);
      }
    }
    word.familyLinks ??= [];
    if (
      !familyRelations(lib, word.id, senseId).some(
        (r) => r.word.id === target.id && r.senseId === targetSense,
      )
    )
      word.familyLinks.push({
        senseId,
        targetWordId: target.id,
        targetSenseId: targetSense,
        description: c.text,
        source,
      });
  }
  word.updatedAt = now();
}
