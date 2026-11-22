import { randomUUID } from "node:crypto";

export type Gender = "m" | "f" | "both" | "unknown";
export type Onset =
  "vowel" | "consonant" | "mute-h" | "aspirated-h" | "unknown";
export type Familiarity = "unmarked" | "unknown" | "fuzzy" | "known";
export type Mode = "copy" | "meaning" | "spelling" | "gender";
export type Sense = {
  id: string;
  pos: string;
  ipa: string;
  en: string;
  zh: string;
  gender: Gender;
  plural: boolean;
  onset: Onset;
  genderSource: string;
};
export type Example = { id: string; french: string; translation: string };
export type Word = {
  id: string;
  word: string;
  senses: Sense[];
  notes: string;
  examples: Example[];
  tags: string[];
  familiarity: Familiarity;
  archived: boolean;
  practice: boolean;
  speech: string;
  articleOverride: string;
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
  batchId?: string;
};
export type Group = {
  id: string;
  name: string;
  wordIds: string[];
  notes: string;
  updatedAt: string;
};
export type CardRecord = {
  id: string;
  wordId: string;
  senseId?: string;
  mode: Exclude<Mode, "copy">;
  card: Record<string, unknown>;
};
export type Review = {
  id: string;
  wordId: string;
  mode: Mode;
  senseId?: string;
  at: string;
  rating: number;
  correct: boolean;
  answer: string;
  expected: string;
  log?: unknown;
};
export type ModeSettings = {
  dailyNew?: number;
  dailyReview?: number | null;
  autoSpeak: boolean;
  scope: "default" | "selected" | "fuzzy" | "known";
  wordIds: string[];
};
export type LibrarySettings = {
  practice?: Partial<Record<Mode, ModeSettings>>;
  backup?: {
    fullHours: number;
    incrementalMinutes: number;
    retainFull?: number;
  };
};
export type Library = {
  version: 1;
  libraryId: string;
  revision: number;
  settings?: LibrarySettings;
  words: Word[];
  groups: Group[];
  cards: CardRecord[];
  reviews: Review[];
};
export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export const canonical = (s: string) =>
  s.normalize("NFC").trim().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
export const searchKey = (s: string) =>
  canonical(s).toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
export const isNoun = (pos: string) =>
  /(?:^|[ /;,])n\./i.test(pos) || /^(noun|nom)\b/i.test(pos);
export function inferSense(
  pos: string,
): Pick<Sense, "gender" | "plural" | "onset" | "genderSource"> {
  const m = /n\s*\.\s*m\b|masc|阳/u.test(pos);
  const f = /n\s*\.\s*f\b|fém|fem|阴/u.test(pos);
  return {
    gender: m && f ? "both" : m ? "m" : f ? "f" : "unknown",
    plural: /\bpl\b|plural/i.test(pos),
    onset: "unknown",
    genderSource: m || f ? "import" : "unconfirmed",
  };
}
export const genderLabel = (g: Gender) =>
  ({
    m: "Masculine",
    f: "Feminine",
    both: "Both / depends on meaning",
    unknown: "Unconfirmed",
  })[g];
export function cleanWord(text: string) {
  return canonical(
    text.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/gu, "").split(/[,，]/u)[0],
  );
}
export function speechWord(w: Word) {
  return cleanWord(w.speech.trim() || w.word);
}
export function mnemonicPhrases(w: Word): string[] {
  return [
    ...new Set(
      w.senses
        .flatMap((s) => articles(w, s))
        .filter((p) => /^(?:un|une|des)\s/iu.test(p)),
    ),
  ];
}
export function articles(w: Word, s: Sense): string[] {
  if (w.articleOverride.trim())
    return w.articleOverride
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const word = speechWord(w);
  if (!word || !isNoun(s.pos)) return [];
  if (s.plural) return [`des ${word}`, `les ${word}`];
  if (s.gender !== "m" && s.gender !== "f") return [];
  const indefinite = `${s.gender === "m" ? "un" : "une"} ${word}`;
  const onset =
    s.onset === "unknown"
      ? /^[aàâäeéèêëiîïoôöuùûüœæ]/iu.test(word)
        ? "vowel"
        : /^[hy]/iu.test(word)
          ? "unknown"
          : "consonant"
      : s.onset;
  return [
    indefinite,
    ...(onset === "unknown"
      ? []
      : [
          onset === "vowel" || onset === "mute-h"
            ? `l’${word}`
            : `${s.gender === "m" ? "le" : "la"} ${word}`,
        ]),
  ];
}
export function emptyLibrary(): Library {
  return {
    version: 1,
    libraryId: uid(),
    revision: 0,
    words: [],
    groups: [],
    cards: [],
    reviews: [],
  };
}
export function newWord(word: string, sense: Sense, batchId?: string): Word {
  return {
    id: uid(),
    word: canonical(word),
    senses: [sense],
    notes: "",
    examples: [],
    tags: [],
    familiarity: "unmarked",
    archived: false,
    practice: true,
    speech: "",
    articleOverride: "",
    createdAt: now(),
    updatedAt: now(),
    batchId,
  };
}
export function setPractice(w: Word, included: boolean) {
  w.practice = included;
}
export function validateLibrary(value: unknown): asserts value is Library {
  const x = value as Library;
  if (
    !x ||
    x.version !== 1 ||
    typeof x.libraryId !== "string" ||
    !Number.isSafeInteger(x.revision) ||
    x.revision < 0
  )
    throw Error("Unsupported or invalid backup format.");
  if (x.settings !== undefined) {
    if (
      !x.settings ||
      typeof x.settings !== "object" ||
      Array.isArray(x.settings)
    )
      throw Error("Invalid library settings.");
    for (const [mode, setting] of Object.entries(x.settings.practice ?? {})) {
      if (
        !["copy", "meaning", "spelling", "gender"].includes(mode) ||
        !setting ||
        typeof setting.autoSpeak !== "boolean" ||
        !["default", "selected", "fuzzy", "known"].includes(setting.scope) ||
        !Array.isArray(setting.wordIds) ||
        setting.wordIds.some((id: unknown) => typeof id !== "string") ||
        [setting.dailyNew, setting.dailyReview].some(
          (v) => v != null && (!Number.isSafeInteger(v) || v < 0 || v > 100000),
        )
      )
        throw Error("Invalid practice settings.");
    }
    const policy = x.settings.backup;
    if (
      policy &&
      (!Number.isFinite(policy.fullHours) ||
        policy.fullHours < 1 ||
        policy.fullHours > 8760 ||
        !Number.isFinite(policy.incrementalMinutes) ||
        policy.incrementalMinutes < 1 ||
        policy.incrementalMinutes > 1440 ||
        (policy.retainFull !== undefined &&
          (!Number.isSafeInteger(policy.retainFull) ||
            policy.retainFull < 1 ||
            policy.retainFull > 100)))
    )
      throw Error("Invalid backup intervals.");
  }
  for (const key of ["words", "groups", "cards", "reviews"] as const) {
    if (!Array.isArray(x[key]) || x[key].length > 2000000)
      throw Error(`Invalid backup ${key}.`);
    const ids = new Set<string>();
    for (const item of x[key]) {
      if (!item || typeof item.id !== "string" || ids.has(item.id))
        throw Error(`Invalid or duplicate ${key} ID.`);
      ids.add(item.id);
    }
  }
  for (const w of x.words) {
    if (
      typeof w.word !== "string" ||
      !w.word.trim() ||
      !Array.isArray(w.senses) ||
      !w.senses.length ||
      !Array.isArray(w.examples) ||
      !Array.isArray(w.tags) ||
      !["unmarked", "unknown", "fuzzy", "known"].includes(w.familiarity) ||
      typeof w.archived !== "boolean" ||
      typeof w.practice !== "boolean" ||
      [w.notes, w.speech, w.articleOverride, w.createdAt, w.updatedAt].some(
        (v) => typeof v !== "string",
      )
    )
      throw Error("Invalid word in backup.");
    const ids = new Set<string>();
    for (const s of w.senses) {
      if (
        !s ||
        typeof s.id !== "string" ||
        ids.has(s.id) ||
        [s.pos, s.ipa, s.en, s.zh, s.genderSource].some(
          (v) => typeof v !== "string",
        ) ||
        !["m", "f", "both", "unknown"].includes(s.gender) ||
        !["vowel", "consonant", "mute-h", "aspirated-h", "unknown"].includes(
          s.onset,
        ) ||
        typeof s.plural !== "boolean"
      )
        throw Error("Invalid sense in backup.");
      ids.add(s.id);
    }
    for (const e of w.examples)
      if (
        !e ||
        typeof e.id !== "string" ||
        typeof e.french !== "string" ||
        typeof e.translation !== "string"
      )
        throw Error("Invalid example in backup.");
    if (w.tags.some((t) => typeof t !== "string"))
      throw Error("Invalid tags in backup.");
  }
  const wordIds = new Set(x.words.map((w) => w.id));
  for (const g of x.groups)
    if (
      typeof g.name !== "string" ||
      typeof g.notes !== "string" ||
      typeof g.updatedAt !== "string" ||
      !Array.isArray(g.wordIds) ||
      g.wordIds.some((id) => !wordIds.has(id))
    )
      throw Error("Invalid group in backup.");
  for (const c of x.cards)
    if (
      !wordIds.has(c.wordId) ||
      !["meaning", "spelling", "gender"].includes(c.mode) ||
      !c.card ||
      !Number.isFinite(Date.parse(String(c.card.due))) ||
      !Number.isFinite(Number(c.card.stability)) ||
      !Number.isFinite(Number(c.card.difficulty))
    )
      throw Error("Invalid scheduling card in backup.");
  for (const r of x.reviews)
    if (
      !wordIds.has(r.wordId) ||
      !["copy", "meaning", "spelling", "gender"].includes(r.mode) ||
      ![1, 2, 3, 4].includes(r.rating) ||
      typeof r.correct !== "boolean" ||
      typeof r.answer !== "string" ||
      typeof r.expected !== "string" ||
      !Number.isFinite(Date.parse(r.at))
    )
      throw Error("Invalid review in backup.");
}
