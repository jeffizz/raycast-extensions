import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";

const execFileAsync = promisify(execFile);

export type Gender = "m" | "f";
export type Onset = "vowel" | "consonant" | "aspirated-h" | "mute-h" | "unknown";
export type NounForm = { text: string; genders: Gender[]; numbers: ("s" | "p")[] };
export type NounEntry = {
  id: string;
  lemma: string;
  gender: Gender[];
  plurals: string[];
  feminine: string[];
  masculine: string[];
  invariable: boolean;
  score: number;
  forms: NounForm[];
  onset: Onset;
  inferredLink?: boolean;
};
export type NounMatch = { entry: NounEntry; matchedForm: string; matchedNumbers: ("s" | "p")[] };

/** Remove balanced parenthetical annotations, including nested or full-width brackets.
 * Return null for malformed input rather than silently guessing the intended word.
 */
export function cleanNounInput(text: string): string | null {
  const brackets: string[] = [];
  let result = "";
  for (const char of text) {
    if (char === "(" || char === "（") {
      brackets.push(char === "(" ? ")" : "）");
    } else if (char === ")" || char === "）") {
      if (brackets.pop() !== char) return null;
    } else if (brackets.length === 0) {
      result += char;
    }
  }
  return brackets.length ? null : result.trim().replace(/\s+/g, " ");
}

export function normalize(text: string): string {
  return text.normalize("NFC").trim().toLocaleLowerCase("fr").replace(/[’‘]/g, "'");
}

export function stripArticle(text: string): string {
  const normalized = normalize(text).replace(/\s+/g, " ");
  return normalized.replace(/^(?:(?:l|d)'|(?:un|une|des|le|la|les|du)\s+)/u, "").trim();
}

// Hex literals avoid passing untrusted input as SQL syntax. The database is read-only.
function sqlText(value: string): string {
  return `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
}

async function queryEntries(assetsPath: string, sql: string): Promise<NounEntry[]> {
  const db = join(assetsPath, "noun-lexicon.sqlite");
  const { stdout } = await execFileAsync("/usr/bin/sqlite3", ["-readonly", "-json", db, sql], { maxBuffer: 8 * 1024 * 1024, timeout: 10000 });
  const rows = stdout.trim() ? JSON.parse(stdout) as { data: string }[] : [];
  return rows.map((row) => JSON.parse(row.data) as NounEntry);
}

export async function lookupNoun(assetsPath: string, input: string): Promise<NounMatch[]> {
  const term = stripArticle(input);
  if (!term) return [];
  const matches: NounMatch[] = [];
  const entries = await queryEntries(assetsPath, `SELECT e.data FROM forms f JOIN entries e ON e.id = f.entry_id WHERE f.form_key = ${sqlText(term)} ORDER BY e.score DESC, e.id`);
  for (const entry of entries) {
    const forms = entry.forms.filter((form) => normalize(form.text) === term);
    const isLemma = normalize(entry.lemma) === term;
    if (forms.length || isLemma) {
      matches.push({
        entry,
        matchedForm: forms[0]?.text ?? entry.lemma,
        matchedNumbers: [...new Set(forms.flatMap((form) => form.numbers))],
      });
    }
  }
  // A lowercase common noun takes precedence over separately capitalized entries
  // (e.g. cheval vs Cheval), but keep uppercase-only matches as a fallback.
  const original = input.trim().replace(/^(?:(?:l|d)[’']|(?:un|une|des|le|la|les|du)\s+)/iu, "");
  const exactCase = matches.filter(({ matchedForm, entry }) => matchedForm === original || entry.lemma === original);
  return (exactCase.length ? exactCase : matches).sort((a, b) => b.entry.score - a.entry.score);
}

export async function linkedNouns(assetsPath: string, matches: NounMatch[]): Promise<NounEntry[]> {
  const ids = new Set(matches.map(({ entry }) => entry.id));
  const direct = matches.flatMap(({ entry }) => [...entry.feminine, ...entry.masculine]);
  const missingUpper = matches.map(({ entry }) => entry).filter((entry) => entry.lemma[0] !== entry.lemma[0].toLocaleLowerCase("fr") && !entry.feminine.length && !entry.masculine.length);
  const inferred: NounEntry[] = [];
  for (const original of missingUpper) {
    const lower = await queryEntries(assetsPath, `SELECT data FROM entries WHERE lemma_key = ${sqlText(normalize(original.lemma))} ORDER BY score DESC`);
    const base = lower.find((entry) => entry.lemma === normalize(original.lemma) && entry.gender.some((g) => original.gender.includes(g)));
    if (!base) continue;
    const targets = [...base.feminine, ...base.masculine];
    if (!targets.length) continue;
    const candidates = await queryEntries(assetsPath, `SELECT data FROM entries WHERE lemma_key IN (${targets.map((x) => sqlText(normalize(x))).join(",")}) ORDER BY score DESC`);
    for (const target of targets) {
      const lowerTarget = candidates.find((entry) => entry.lemma === normalize(target) && [...entry.feminine, ...entry.masculine].some((word) => normalize(word) === normalize(base.lemma)));
      const upperTarget = candidates.find((entry) => entry.lemma === target[0].toLocaleUpperCase("fr") + target.slice(1) && entry.gender.some((g) => lowerTarget?.gender.includes(g)));
      if (lowerTarget && upperTarget && !ids.has(upperTarget.id)) inferred.push({ ...upperTarget, inferredLink: true });
    }
  }
  const linked = [...new Set(direct.map(normalize))];
  const entries = linked.length ? await queryEntries(assetsPath, `SELECT data FROM entries WHERE lemma_key IN (${linked.map(sqlText).join(",")}) ORDER BY score DESC, id`) : [];
  return [...entries.filter((entry) => !ids.has(entry.id)), ...inferred.filter((entry) => !entries.some((e) => e.id === entry.id))];
}

export type ArticlePhrase = { text: string; description: string };

/** Only attested singular indefinite phrases are submitted for translation. */
export function translationInputs(entry: NounEntry): string[] {
  return articlePhrases(entry).filter((phrase) => /^(?:un|une)\s/.test(phrase.text)).map((phrase) => phrase.text);
}

/** Reuse the matching gender's singular translation; never display it on plurals. */
export function translationForPhrase(entry: NounEntry, phrase: ArticlePhrase, translations: Record<string, string>): string {
  if (!phrase.description.includes("单数")) return "";
  const gender = phrase.description.includes("n.m.") ? "m" : phrase.description.includes("n.f.") ? "f" : undefined;
  if (!gender) return "";
  return translations[`${gender === "m" ? "un" : "une"} ${entry.lemma}`] ?? "";
}

/** Return matching visible phrases, preserving ambiguity rather than guessing gender. */
export function matchingPhrases(matches: NounMatch[], input: string): { entry: NounEntry; phrase: ArticlePhrase; index: number }[] {
  const normalized = normalize(input).replace(/\s+/g, " ");
  const term = stripArticle(input);
  const explicit = /^(?:un|une|des|le|la|les)\s|^l'/u.test(normalized);
  return matches.flatMap(({ entry }) => articlePhrases(entry).map((phrase, index) => ({ entry, phrase, index })))
    .filter(({ phrase }) => stripArticle(phrase.text) === term && (!explicit || normalize(phrase.text) === normalized));
}

export function preferredPhrase(matches: NounMatch[], input: string) {
  const candidates = matchingPhrases(matches, input);
  const explicit = /^(?:un|une|des|le|la|les)\s|^l'/u.test(normalize(input));
  return explicit ? candidates[0] : candidates.find(({ phrase }) => /^(?:un|une|des)\s/.test(phrase.text)) ?? candidates[0];
}

export function speechForSelection(matches: NounMatch[], input: string, related: NounEntry[] = []): string[] {
  const candidates = matchingPhrases(matches, input);
  const eligible = new Set(candidates.map(({ entry }) => entry.id));
  const raw = normalize(input);
  const knownGender = /^(?:un|le)\s/.test(raw) ? "m" : /^(?:une|la)\s/.test(raw) ? "f" : undefined;
  const selected = matches.filter(({ entry }) => eligible.has(entry.id)).map(({ entry }) => entry);
  // An explicitly gendered article restricts the selection; without one include
  // only counterparts explicitly named in the matching dictionary entries.
  const counterpartKeys = new Set(selected.flatMap((entry) => [...entry.feminine, ...entry.masculine]));
  const distinctLemmas = new Set(selected.map((entry) => entry.lemma));
  if (distinctLemmas.size > 1 && selected.some((entry) => !selected.every((other) => other.lemma === entry.lemma || [...entry.feminine, ...entry.masculine].includes(other.lemma) || [...other.feminine, ...other.masculine].includes(entry.lemma)))) return [];
  const relatedEntries = related.filter((entry) => counterpartKeys.has(entry.lemma) || entry.inferredLink);
  const explicitPlural = /^(?:des|les)\s/.test(raw);
  const pluralOnly = selected.length > 0 && matches.filter(({ entry }) => eligible.has(entry.id)).every((match) => match.matchedNumbers.length === 1 && match.matchedNumbers[0] === "p");
  if (explicitPlural || pluralOnly) {
    const definite = /^les\s/.test(raw);
    const matchedPlural = candidates.filter(({ phrase }) => phrase.text.startsWith(definite ? "les " : "des ")).map(({ phrase }) => phrase.text);
    const relatedPlural = explicitPlural ? [] : relatedEntries.flatMap((entry) => articlePhrases(entry).filter((phrase) => phrase.text.startsWith("des ")).map((phrase) => phrase.text));
    // Plural articles do not show gender, so follow with the attested singular un/une.
    const singularEntries = explicitPlural ? selected : [...selected, ...relatedEntries];
    const singular = singularEntries.flatMap((entry) => articlePhrases(entry).filter((phrase) => /^(?:un|une)\s/.test(phrase.text)).map((phrase) => phrase.text));
    return [...new Set([...matchedPlural, ...relatedPlural, ...singular])];
  }
  const entries = knownGender ? selected : [...selected, ...relatedEntries];
  const phrases = entries.flatMap((entry) => articlePhrases(entry)
    .filter((phrase) => /^(?:un|une)\s/.test(phrase.text) && (!knownGender || phrase.text.startsWith(knownGender === "m" ? "un " : "une ")))
    .map((phrase) => phrase.text));
  return [...new Set(phrases)];
}
export function speechPlanForSelection(matches: NounMatch[], input: string, related: NounEntry[] = []): { phrases: string[]; ambiguous: boolean } {
  const phrases = speechForSelection(matches, input, related);
  if (phrases.length) return { phrases, ambiguous: false };
  const eligible = new Set(matchingPhrases(matches, input).map(({ entry }) => entry.id));
  const candidates = matches.filter(({ entry }) => eligible.has(entry.id)).sort((a, b) => {
    const exactA = normalize(a.entry.lemma) === stripArticle(input) ? 1 : 0;
    const exactB = normalize(b.entry.lemma) === stripArticle(input) ? 1 : 0;
    return exactB - exactA || b.entry.score - a.entry.score || a.entry.id.localeCompare(b.entry.id);
  });
  if (new Set(candidates.map(({ entry }) => entry.lemma)).size < 2) return { phrases: [], ambiguous: false };
  for (const candidate of candidates) {
    const single = speechForSelection([candidate], input);
    if (single.length) return { phrases: [single[0]], ambiguous: true };
  }
  return { phrases: [], ambiguous: true };
}

export function articlePhrases(entry: NounEntry): ArticlePhrase[] {
  const result: ArticlePhrase[] = [];
  const singularForms = entry.forms.filter((f) => f.numbers.includes("s") && normalize(f.text) === normalize(entry.lemma));
  // Do not construct singular forms unless attested in the source table.
  for (const gender of entry.gender) {
    if (normalize(entry.lemma) === "gens") continue; // Predominantly plural; source analyses include misleading singulars.
    if (entry.gender.length > 1 && gender === "f" && ["amour", "délice"].includes(normalize(entry.lemma))) continue;
    if (!singularForms.some((f) => f.genders.includes(gender))) continue;
    const noun = entry.lemma;
    const label = gender === "m" ? "n.m." : "n.f.";
    result.push({ text: `${gender === "m" ? "un" : "une"} ${noun}`, description: `${label} · 不定冠词 · 单数` });
    if (entry.onset !== "unknown") {
      const definite = entry.onset === "vowel" || entry.onset === "mute-h" ? `l’${noun}` : `${gender === "m" ? "le" : "la"} ${noun}`;
      result.push({ text: definite, description: `${label} · 定冠词 · 单数` });
    }
  }
  const attestedPlurals = entry.forms.filter((f) => f.numbers.includes("p"));
  const plurals = [...new Set(attestedPlurals.map((f) => f.text))];
  for (const plural of plurals) {
    result.push({ text: `des ${plural}`, description: "不定冠词 · 复数" });
    result.push({ text: `les ${plural}`, description: "定冠词 · 复数" });
  }
  return result;
}
