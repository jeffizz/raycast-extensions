import {
  canonical,
  ContentSource,
  Library,
  newWord,
  now,
  Word,
} from "../core/model";
import { Candidate, candidateSense, safeVocabulary } from "./core";

export const familyKey = (word: string) =>
  canonical(word).toLocaleLowerCase("fr");
export function familyMatches(lib: Library, headword: string) {
  return lib.words.filter((w) => familyKey(w.word) === familyKey(headword));
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
  for (const { candidate: c, existingId, targetSenseId } of selections) {
    if (!c.headword || !safeVocabulary(c.headword) || !c.text)
      throw Error("Invalid family candidate.");
    if (familyKey(c.headword) === familyKey(word.word))
      throw Error("A word cannot link to itself.");
    const matches = familyMatches(lib, c.headword);
    let target: Word;
    let targetSense = targetSenseId;
    if (existingId) {
      const found = matches.find((w) => w.id === existingId);
      if (!found) throw Error("Existing word changed. Refresh candidates.");
      target = found;
      if (targetSense && !target.senses.some((s) => s.id === targetSense))
        throw Error("Target sense changed.");
    } else {
      const batchWord = created.get(familyKey(c.headword));
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
        created.set(familyKey(c.headword), target);
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
