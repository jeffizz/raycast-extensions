import { Clipboard, showHUD } from "@raycast/api";
import { pronounceText } from "./pronounce";

/**
 * Convert an Excel-style conjugation row/column to frdic's conjugation prompt.
 *
 * Supported clipboard layouts:
 * - 7 cells: infinitive + six conjugated forms
 * - 6 cells: six conjugated forms only
 *
 * Excel may separate copied cells with tabs (row) or newlines (column).
 */
function formatConjugationClipboard(raw: string): string | null {
  const cells = raw
    .trim()
    .split(/[\t\r\n]+/)
    .map((cell) => cell.trim())
    .filter(Boolean);

  // Require exactly six forms, or an infinitive followed by six forms.
  // A form may contain spaces, for example `Je connais`.
  if (cells.length !== 6 && cells.length !== 7) {
    return null;
  }

  if (cells.length === 7) {
    const [infinitive, ...forms] = cells;
    return `${infinitive.toUpperCase()}. ${formatForms(forms)}`;
  }

  // With six cells, the clipboard contains the six person forms but no
  // infinitive. Keep all six forms and apply the same pause pattern.
  return formatForms(cells);
}

const SUBJECTS = ["Je", "Tu", "Il", "Nous", "Vous", "Ils"];

function formatForms(forms: string[]): string {
  return forms
    .map((form, index) => {
      const withSubject = addSubjectIfMissing(form, SUBJECTS[index]);
      return index < forms.length - 1 ? `${withSubject}?` : withSubject;
    })
    .join("\t");
}

/** Add the canonical subject pronoun when Excel contains bare verb forms. */
function addSubjectIfMissing(form: string, subject: string): string {
  const text = form.trim();
  // Do not duplicate a pronoun if the copied cell already includes one.
  if (/^(je|j['’]|tu|il|elle|on|nous|vous|ils|elles)\b/i.test(text)) {
    return text;
  }

  // French contracts "Je" before a vowel or mute h: j'aime, j'habite.
  if (subject === "Je" && /^[aeiouyàâäéèêëîïôöùûüÿœæh]/i.test(text)) {
    return `J'${text}`;
  }

  return `${subject} ${text}`;
}

/** Pronounce Excel conjugation cells or the complete trimmed clipboard text. */
export default async function Command() {
  let raw: string | null = null;
  try {
    raw = (await Clipboard.readText()) || null;
  } catch {
    raw = null;
  }

  if (!raw?.trim()) {
    await showHUD("No text found in the clipboard");
    return;
  }

  const conjugation = formatConjugationClipboard(raw);
  await pronounceText(conjugation ?? raw, "No text found in the clipboard");
}
