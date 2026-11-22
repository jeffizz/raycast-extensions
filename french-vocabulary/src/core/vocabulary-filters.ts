import { isNoun, Word } from "./model";

export function matchesWordFilters(
  word: Word,
  pos: string,
  familiarity: string,
) {
  const familiarityMatches =
    familiarity === "all" ||
    (familiarity === "fuzzy"
      ? word.familiarity === "fuzzy" || word.familiarity === "unknown"
      : word.familiarity === familiarity);
  const posMatches =
    pos === "all" ||
    word.senses.some((s) =>
      pos === "noun"
        ? isNoun(s.pos)
        : pos === "verb"
          ? /^v\./i.test(s.pos)
          : pos === "adjective"
            ? /adj\./i.test(s.pos)
            : /adv\./i.test(s.pos),
    );
  return familiarityMatches && posMatches;
}
