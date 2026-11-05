export type Cell = string[] | null;

export type VerbForms = {
  pp: string[];
  prp: string[];
  /** présent, imparfait, futur, conditionnel, subjonctif, impératif */
  t: Cell[][];
};

export type VerbBook = {
  source: string;
  version: string;
  verbs: Record<string, VerbForms>;
  common: string[];
};

export const TENSES = [
  { zh: "现在时", fr: "présent" },
  { zh: "未完成过去时", fr: "imparfait" },
  { zh: "简单将来时", fr: "futur simple" },
  { zh: "条件式现在时", fr: "conditionnel" },
  { zh: "虚拟式现在时", fr: "subjonctif" },
  { zh: "命令式", fr: "impératif" },
] as const;

export const ROWS = [
  { label: "je", subject: "Je" },
  { label: "tu", subject: "Tu" },
  { label: "il", subject: "Il" },
  { label: "nous", subject: "Nous" },
  { label: "vous", subject: "Vous" },
  { label: "ils", subject: "Ils" },
] as const;

const VOWEL = /^[aeiouyàâäéèêëîïôöùûüÿœæ]/i;
const HAS_SUBJECT = /^(je|j['’]|tu|il|elle|on|ils|elles)\b/i;

export function withSubject(form: string, subject: string, hAspire: boolean) {
  const text = form.trim();
  if (HAS_SUBJECT.test(text)) return text;
  // Pronominal nous/vous already include the reflexive pronoun once: "nous souvenons".
  if (/^nous\b/i.test(text)) return /^nous\s+nous\b/i.test(text) ? text : `Nous ${text}`;
  if (/^vous\b/i.test(text)) return /^vous\s+vous\b/i.test(text) ? text : `Vous ${text}`;
  if (subject === "Je" && (VOWEL.test(text) || (/^h/i.test(text) && !hAspire))) {
    return `J'${text}`;
  }
  return `${subject} ${text}`;
}

export function fold(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .trim();
}

export function infinitiveQuery(input: string) {
  return fold(input)
    .replace(/^s['’]\s*/, "")
    .replace(/^se\s+/, "");
}

export function normAnswer(input: string) {
  return input
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[’ʼ′]/g, "'")
    .replace(/\s+/g, " ");
}

export function showForms(forms: string[] | null | undefined) {
  if (!forms || forms.length === 0) return "—";
  return forms.join(" / ");
}

export type Grade = "na" | "empty" | "ok" | "bad";

export function gradeAnswer(expected: string[] | null | undefined, raw: string): Grade {
  if (!expected || expected.length === 0) return "na";
  if (!raw.trim()) return "empty";
  const n = normAnswer(raw);
  return expected.some((form) => normAnswer(form) === n) ? "ok" : "bad";
}

export function searchVerbs(book: VerbBook, raw: string, limit = 40) {
  const q = infinitiveQuery(raw);
  if (!q) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const name of Object.keys(book.verbs)) {
    const folded = fold(name);
    if (folded === q) exact.push(name);
    else if (folded.startsWith(q)) prefix.push(name);
    else if (folded.includes(q)) contains.push(name);
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

export function resolveVerb(book: VerbBook, raw: string) {
  const q = infinitiveQuery(raw);
  if (!q) return null;
  const direct = raw.trim().toLowerCase();
  if (book.verbs[direct]) return direct;
  return Object.keys(book.verbs).find((name) => fold(name) === q) ?? null;
}

/** frdic prompt. The infinitive is spoken only with the participles. */
export function conjugationPrompt(infinitive: string, pieces: string[], sayInfinitive = false) {
  const spoken = pieces.map((piece, index) => (index < pieces.length - 1 ? `${piece}?` : piece)).join("\t");
  return sayInfinitive ? `${infinitive.toUpperCase()}. ${spoken}` : spoken;
}

export type SpeechLine = {
  id: string;
  zh: string;
  preview: string;
  speech: string;
};

export function speechLines(infinitive: string, forms: VerbForms, hAspire: boolean): SpeechLine[] {
  const lines: SpeechLine[] = [];
  const parts = [forms.pp[0], forms.prp[0]].filter((form): form is string => Boolean(form));
  if (parts.length) {
    lines.push({
      id: "part",
      zh: "分词",
      preview: parts.join(" · "),
      speech: conjugationPrompt(infinitive, parts, true),
    });
  }
  TENSES.forEach((tense, tenseIndex) => {
    const pieces: string[] = [];
    (forms.t[tenseIndex] ?? []).forEach((cell, person) => {
      if (!cell?.length) return;
      const form = cell[0];
      pieces.push(tenseIndex === 5 ? form : withSubject(form, ROWS[person].subject, hAspire));
    });
    if (!pieces.length) return;
    lines.push({
      id: `t${tenseIndex}`,
      zh: tense.zh,
      preview: pieces.join(" · "),
      speech: conjugationPrompt(infinitive, pieces),
    });
  });
  return lines;
}

export function tableMarkdown(infinitive: string, forms: VerbForms) {
  const head = `|  | ${TENSES.map((tense) => tense.zh).join(" | ")} |`;
  const rule = `| --- | ${TENSES.map(() => "---").join(" | ")} |`;
  const body = ROWS.map((row, rowIndex) => {
    const cells = TENSES.map((_, tenseIndex) => showForms(forms.t[tenseIndex]?.[rowIndex]).replaceAll("|", "/"));
    return `| ${row.label} | ${cells.join(" | ")} |`;
  });
  const pp = showForms(forms.pp);
  const prp = showForms(forms.prp);
  const title = pp === "—" && prp === "—" ? infinitive : `${infinitive} (${pp} / ${prp})`;
  return [`### ${title}`, "", head, rule, ...body].join("\n");
}

export function expectedOf(forms: VerbForms, id: string): string[] | null {
  if (id === "pp") return forms.pp.length ? forms.pp : null;
  if (id === "prp") return forms.prp.length ? forms.prp : null;
  const match = /^c(\d)-(\d)$/.exec(id);
  if (!match) return null;
  return forms.t[Number(match[2])]?.[Number(match[1])] ?? null;
}

export function answerIds(forms: VerbForms) {
  const ids: string[] = [];
  if (forms.pp.length) ids.push("pp");
  if (forms.prp.length) ids.push("prp");
  for (let tense = 0; tense < TENSES.length; tense++) {
    for (let row = 0; row < ROWS.length; row++) {
      const cell = forms.t[tense]?.[row];
      if (cell?.length) ids.push(`c${row}-${tense}`);
    }
  }
  return ids;
}

export function slotLabel(id: string) {
  const header = /^h(\d)$/.exec(id);
  if (header) return TENSES[Number(header[1])]?.zh ?? id;
  if (id === "pp") return "过去分词";
  if (id === "prp") return "现在分词";
  const match = /^c(\d)-(\d)$/.exec(id);
  if (!match) return id;
  return `${TENSES[Number(match[2])]?.zh ?? ""} · ${ROWS[Number(match[1])]?.label ?? ""}`;
}

function practiceCell(
  forms: VerbForms,
  answers: Record<string, string>,
  cursor: string,
  checked: boolean,
  id: string,
) {
  const expected = expectedOf(forms, id);
  if (!expected) return "—";
  const raw = (answers[id] ?? "").replace(/\s+/g, " ").trim();
  let body = "____";
  if (raw) {
    const safe = raw.replaceAll("|", "/");
    body =
      checked && gradeAnswer(expected, raw) === "bad"
        ? `${safe} → ${showForms(expected).replaceAll("|", "/")}`
        : safe;
  }
  return id === cursor ? `【${body}】` : body;
}

/** Same grid as lookup. 【】 is the cell the search bar is filling. */
export function practiceMarkdown(
  infinitive: string,
  forms: VerbForms,
  answers: Record<string, string>,
  cursor: string,
  checked: boolean,
) {
  const corner = (["pp", "prp"] as const)
    .filter((id) => expectedOf(forms, id))
    .map((id) => `${slotLabel(id)} ${practiceCell(forms, answers, cursor, checked, id)}`)
    .join("　　");
  const head = `|  | ${TENSES.map((tense, index) =>
    cursor.endsWith(`-${index}`) ? `**${tense.zh}**` : tense.zh,
  ).join(" | ")} |`;
  const rule = `| --- | ${TENSES.map(() => "---").join(" | ")} |`;
  const body = ROWS.map((row, rowIndex) => {
    const label = cursor.startsWith(`c${rowIndex}-`) ? `**${row.label}**` : row.label;
    const cells = TENSES.map((_, tenseIndex) =>
      practiceCell(forms, answers, cursor, checked, `c${rowIndex}-${tenseIndex}`),
    );
    return `| ${label} | ${cells.join(" | ")} |`;
  });
  return [`### ${infinitive}`, "", corner, "", head, rule, ...body].join("\n");
}
