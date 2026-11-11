import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { environment } from "@raycast/api";
import { fold, resolveVerb, type VerbBook } from "./model";

const execFileAsync = promisify(execFile);

export type LexikAnalysis = {
  lemma: string;
  upos: "VERB" | "AUX";
  multext: string;
  feats: string;
};

// Encode user input as a SQLite blob literal, never as SQL syntax.
function sqlText(value: string): string {
  return `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
}

function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

export async function lookupInflectedForm(input: string, assetsPath = environment.assetsPath): Promise<LexikAnalysis[]> {
  const term = input.normalize("NFC").trim().toLocaleLowerCase("fr");
  if (!term) return [];
  const db = join(assetsPath, "lexik-verbs.sqlite");
  const query = async (condition: string): Promise<LexikAnalysis[]> => {
    const sql = [
      "SELECT l.lemma, l.upos, t.multext, t.feats",
      "FROM spellings s",
      "JOIN analyses a ON a.spelling_id = s.id",
      "JOIN lemmas l ON l.id = a.lemma_id",
      "JOIN tags t ON t.id = a.tag_id",
      `WHERE ${condition}`,
      "ORDER BY l.lemma, t.multext",
    ].join(" ");
    const { stdout } = await execFileAsync("/usr/bin/sqlite3", ["-readonly", "-json", db, sql], {
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    });
    return stdout.trim() ? JSON.parse(stdout) as LexikAnalysis[] : [];
  };

  // Prefer exact spelling; the binary index avoids a full scan of analyses.
  const exact = await query(`s.ortho = ${sqlText(term)} COLLATE BINARY`);
  if (exact.length) return exact;
  return query(`s.search_key = ${sqlText(searchKey(term))} COLLATE BINARY`);
}

export type MatchedCell = { tense: number; person: number; form: string };
export type VerbMatch = { infinitive: string; matchedCells: MatchedCell[] };

/** Group analyses by existing conjugation page, retaining all valid visible cells. */
export function groupVerbMatches(book: VerbBook, query: string, analyses: LexikAnalysis[]): VerbMatch[] {
  const groups = new Map<string, MatchedCell[]>();
  for (const analysis of analyses) {
    const infinitive = resolveVerb(book, analysis.lemma);
    if (!infinitive) continue;
    const cells = groups.get(infinitive) ?? [];
    groups.set(infinitive, cells);
    const cell = lookupCell(analysis.feats);
    if (!cell) continue;
    const forms = book.verbs[infinitive].t[cell.tense]?.[cell.person];
    if (!forms?.some((form) => fold(form) === fold(query))) continue;
    if (!cells.some((item) => item.tense === cell.tense && item.person === cell.person)) {
      cells.push({ ...cell, form: query });
    }
  }
  return [...groups].map(([infinitive, matchedCells]) => ({ infinitive, matchedCells }))
    .sort((a, b) => a.infinitive.localeCompare(b.infinitive, "fr"));
}

export async function findVerbMatches(book: VerbBook, query: string, assetsPath?: string): Promise<VerbMatch[]> {
  const analyses = await lookupInflectedForm(query, assetsPath);
  return groupVerbMatches(book, query, analyses);
}

/** Convert a LeXiK/UD analysis to an existing lookup cell, or null if unsupported. */
export function lookupCell(feats: string): { tense: number; person: number } | null {
  const values = new Map(feats.split("|").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
  if (values.get("VerbForm") !== "Fin") return null;

  const mood = values.get("Mood");
  const tenseTag = values.get("Tense");
  let tense: number;
  if (mood === "Ind" && tenseTag === "Pres") tense = 0;
  else if (mood === "Ind" && tenseTag === "Imp") tense = 1;
  else if (mood === "Ind" && tenseTag === "Fut") tense = 2;
  else if (mood === "Cnd") tense = 3;
  else if (mood === "Sub" && tenseTag === "Pres") tense = 4;
  else if (mood === "Imp" && tenseTag === "Pres") tense = 5;
  else return null;

  const person = Number(values.get("Person"));
  const number = values.get("Number");
  if (!Number.isInteger(person) || person < 1 || person > 3) return null;
  if (number !== "Sing" && number !== "Plur") return null;

  // The plugin rows are je, tu, il/elle/on, nous, vous, ils/elles.
  return { tense, person: (number === "Sing" ? 0 : 3) + person - 1 };
}
