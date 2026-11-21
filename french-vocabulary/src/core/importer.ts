import { createHash } from "node:crypto";
import {
  canonical,
  inferSense,
  Library,
  newWord,
  now,
  Sense,
  uid,
} from "./model";

export type Field = "word" | "pos" | "ipa" | "en" | "zh" | "ignore";
export const fields: Field[] = ["word", "pos", "ipa", "en", "zh", "ignore"];
export const labels: Record<Field, string> = {
  word: "French Word",
  pos: "Part of Speech",
  ipa: "IPA",
  en: "English",
  zh: "Chinese",
  ignore: "Ignore",
};
export type Parsed = {
  rows: string[][];
  mapping: Field[];
  header: boolean;
  warnings: string[];
};
export type ImportStats = {
  words: number;
  senses: number;
  duplicates: number;
  filled: number;
  repaired?: number;
};
const aliases: Record<string, Field> = {
  word: "word",
  words: "word",
  french: "word",
  fr: "word",
  mot: "word",
  词汇: "word",
  单词: "word",
  法语: "word",
  pos: "pos",
  "part of speech": "pos",
  nature: "pos",
  词性: "pos",
  ipa: "ipa",
  phonétique: "ipa",
  pronunciation: "ipa",
  音标: "ipa",
  english: "en",
  en: "en",
  英文: "en",
  chinese: "zh",
  zh: "zh",
  中文: "zh",
  释义: "zh",
};

/** Quote-aware TSV/CSV parser, including Excel's multiline quoted cells. */
export function parseTable(text: string): string[][] {
  text = text.replace(/^\uFEFF/u, "");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || cell.length === 0)) {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed quoted cell. Check the pasted table.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function detectColumns(text: string): Parsed {
  const all = parseTable(text);
  if (!all.length) throw Error("Paste at least one vocabulary row.");
  const width = Math.max(...all.map((r) => r.length));
  if (width > 30) throw Error("Too many columns (maximum 30).");
  const headerMap = all[0].map((x) => aliases[x.toLocaleLowerCase().trim()]);
  const header =
    headerMap.filter(Boolean).length >= 2 && headerMap.includes("word");
  const rows = header ? all.slice(1) : all;
  const warnings: string[] = [];
  let mapping: Field[] = Array(width).fill("ignore");
  if (header) mapping = mapping.map((_, i) => headerMap[i] ?? "ignore");
  else {
    const sample = rows.slice(0, 30);
    const scores = Array.from({ length: width }, (_, i) => {
      const cells = sample.map((r) => r[i] ?? "").filter(Boolean);
      const ratio = (fn: (x: string) => boolean) =>
        cells.filter(fn).length / Math.max(1, cells.length);
      return {
        i,
        zh: ratio((x) => /\p{Script=Han}/u.test(x)),
        pos: ratio((x) =>
          /^(?:n\.|v\.|adj\.|adv\.|prép\.|prep\.|pron\.|art\.|conj\.|interj\.|loc\.|noun\b|verb\b)/iu.test(
            x,
          ),
        ),
        ipa: ratio((x) => /^\s*[/\[].+[/\]]/u.test(x)),
      };
    });
    for (const field of ["zh", "pos", "ipa"] as const) {
      const best = [...scores]
        .filter((s) => mapping[s.i] === "ignore")
        .sort((a, b) => b[field] - a[field])[0];
      if (best && best[field] >= 0.55) mapping[best.i] = field;
    }
    const rest = mapping
      .map((f, i) => (f === "ignore" ? i : -1))
      .filter((i) => i >= 0);
    // French/English order is only a suggestion, never an invisible automatic decision.
    if (rest.length) mapping[rest[0]] = "word";
    if (rest.length > 1) mapping[rest[1]] = "en";
    warnings.push(
      "No header detected. French and English are suggested by column order; confirm the mapping below.",
    );
  }
  if (rows.some((r) => r.length !== width))
    warnings.push(
      "Some rows have missing cells; inspect the preview before importing.",
    );
  return { rows, mapping, header, warnings };
}
function meaningKey(s: Pick<Sense, "pos" | "ipa" | "en" | "zh">) {
  return JSON.stringify([s.pos, s.ipa, s.en, s.zh].map(canonical));
}
export type ImportConflict = {
  key: string;
  row: number;
  word: string;
  incoming: Sense;
  candidates: Sense[];
};
export type ImportDecision = {
  action: "keep" | "update" | "add" | "merge";
  fields?: Partial<
    Record<
      "pos" | "ipa" | "en" | "zh",
      "existing" | "incoming" | "existing-first" | "incoming-first"
    >
  >;
  target?: number;
};
export function combineImportText(existing: string, incoming: string) {
  const a = existing.trim(),
    b = incoming.trim();
  if (!a) return b;
  if (!b || canonical(a) === canonical(b)) return a;
  return a + "; " + b;
}
export type ImportResolver = (conflict: ImportConflict) => ImportDecision;
// Compare presentation variants only for review suggestions, never automatic merging.
const reviewKey = (text: string) =>
  canonical(text)
    .replace(/[〈《<][^〉》>]*[〉》>]|【[^】]*】/gu, "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, "");
export function applyImport(
  lib: Library,
  rows: string[][],
  mapping: Field[],
  batchId: string = uid(),
  resolve?: ImportResolver,
): ImportStats {
  if (mapping.filter((f) => f === "word").length !== 1)
    throw Error("Map exactly one French Word column.");
  const used = mapping.filter((f) => f !== "ignore");
  if (new Set(used).size !== used.length)
    throw Error("Each field can only be mapped once.");
  const stats: ImportStats = { words: 0, senses: 0, duplicates: 0, filled: 0 };
  const index = new Map(lib.words.map((w) => [canonical(w.word), w]));
  for (const [i, row] of rows.entries()) {
    const values = { word: "", pos: "", ipa: "", en: "", zh: "" };
    mapping.forEach((f, j) => {
      if (f !== "ignore") values[f] = row[j]?.trim() ?? "";
    });
    if (!values.word) {
      if (row.some(Boolean)) throw Error(`Row ${i + 1}: French Word is empty.`);
      continue;
    }
    if (values.word.length > 300)
      throw Error(`Row ${i + 1}: word is too long. Check the column mapping.`);
    const sense: Sense = {
      id: uid(),
      pos: values.pos,
      ipa: values.ipa,
      en: values.en,
      zh: values.zh,
      ...inferSense(values.pos),
    };
    const word = index.get(canonical(values.word));
    if (!word) {
      const w = newWord(values.word, sense, batchId);
      lib.words.push(w);
      index.set(canonical(values.word), w);
      stats.words++;
      continue;
    }
    // Replacement characters mean bytes were already lost. Repair only from
    // a user-supplied original row with one unambiguous matching translation.
    const damaged = word.senses.filter(
      (s) =>
        canonical(s.pos) === canonical(sense.pos) &&
        (["en", "zh"] as const).some(
          (k) =>
            s[k] &&
            !s[k].includes("\uFFFD") &&
            canonical(s[k]) === canonical(sense[k]),
        ) &&
        (["ipa", "en", "zh"] as const).some(
          (k) =>
            s[k].includes("\uFFFD") && sense[k] && !sense[k].includes("\uFFFD"),
        ) &&
        (["ipa", "en", "zh"] as const).every(
          (k) =>
            !s[k] ||
            s[k].includes("\uFFFD") ||
            !sense[k] ||
            canonical(s[k]) === canonical(sense[k]),
        ),
    );
    if (damaged.length === 1) {
      for (const k of ["ipa", "en", "zh"] as const)
        if (
          damaged[0][k].includes("\uFFFD") &&
          sense[k] &&
          !sense[k].includes("\uFFFD")
        )
          damaged[0][k] = sense[k];
      stats.repaired = (stats.repaired ?? 0) + 1;
      word.updatedAt = now();
      continue;
    }
    if (word.senses.some((s) => meaningKey(s) === meaningKey(sense))) {
      stats.duplicates++;
      continue;
    }
    const compatible = word.senses.filter(
      (s) =>
        canonical(s.pos) === canonical(sense.pos) &&
        ["ipa", "en", "zh"].every(
          (k) =>
            !s[k as "ipa"] ||
            !sense[k as "ipa"] ||
            canonical(s[k as "ipa"]) === canonical(sense[k as "ipa"]),
        ),
    );
    // Filling needs at least one identical non-empty meaning, not merely a shared POS.
    const fill =
      compatible.length === 1 &&
      ["en", "zh"].some(
        (k) =>
          sense[k as "en"] &&
          canonical(sense[k as "en"]) === canonical(compatible[0][k as "en"]),
      )
        ? compatible[0]
        : undefined;
    if (!fill && resolve) {
      const candidates = word.senses.filter(
        (s) =>
          reviewKey(s.pos) === reviewKey(sense.pos) &&
          (["en", "zh"] as const).some(
            (k) => reviewKey(s[k]) && reviewKey(s[k]) === reviewKey(sense[k]),
          ),
      );
      if (candidates.length) {
        const key = createHash("sha256")
          .update(
            JSON.stringify([
              i,
              values.word,
              meaningKey(sense),
              candidates.map(meaningKey),
            ]),
          )
          .digest("hex");
        const decision = resolve({
          key,
          row: i + 1,
          word: word.word,
          incoming: sense,
          candidates,
        });
        if (decision.action === "keep") {
          stats.duplicates++;
          continue;
        }
        if (decision.action === "update" || decision.action === "merge") {
          const target = candidates[decision.target ?? 0];
          if (!target)
            throw Error("The selected import target is no longer available.");
          for (const k of ["pos", "ipa", "en", "zh"] as const)
            if (decision.action === "merge") {
              const source = decision.fields?.[k];
              if (source === "incoming") target[k] = sense[k];
              else if (
                (k === "en" || k === "zh") &&
                source === "existing-first"
              )
                target[k] = combineImportText(target[k], sense[k]);
              else if (
                (k === "en" || k === "zh") &&
                source === "incoming-first"
              )
                target[k] = combineImportText(sense[k], target[k]);
            } else if (sense[k]) target[k] = sense[k];
          stats.filled++;
          word.updatedAt = now();
          continue;
        }
      }
    }
    if (fill) {
      for (const k of ["ipa", "en", "zh"] as const)
        if (!fill[k]) fill[k] = sense[k];
      stats.filled++;
    } else {
      word.senses.push(sense);
      stats.senses++;
    }
    word.updatedAt = now();
  }
  return stats;
}
export function importSummary(s: ImportStats) {
  return `${s.words} new words · ${s.senses} added senses · ${s.filled} completed · ${s.duplicates} duplicates skipped${s.repaired ? ` · ${s.repaired} repaired` : ""}`;
}
