const SUBJECTS = ["Je", "Tu", "Il", "Nous", "Vous", "Ils"];

/** Remove one or more parenthesized groups only at the text boundaries. */
export function stripBoundaryParentheses(raw: string): string {
  let text = raw.trim();

  // Repeat so `(x)(y)amoureux(euse)(z)` becomes `amoureux`.
  let previous: string;
  do {
    previous = text;
    text = text
      .replace(/^(?:\([^()]*\)\s*)+/, "")
      .replace(/(?:\s*\([^()]*\))+$/, "")
      .trim();
  } while (text !== previous);

  return text;
}

/**
 * Format six or seven tab/newline-separated cells as the frdic conjugation
 * prompt. Seven cells means infinitive plus six forms; six means forms only.
 */
export function formatConjugation(raw: string): string | null {
  const cells = raw
    .trim()
    .split(/[\t\r\n]+/)
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length !== 6 && cells.length !== 7) {
    return null;
  }

  if (cells.length === 7) {
    const [infinitive, ...forms] = cells;
    return `${infinitive.toUpperCase()}. ${formatForms(forms)}`;
  }

  return formatForms(cells);
}

function formatForms(forms: string[]): string {
  return forms
    .map((form, index) => {
      const withSubject = addSubjectIfMissing(form, SUBJECTS[index]);
      return index < forms.length - 1 ? `${withSubject}?` : withSubject;
    })
    .join("\t");
}

function addSubjectIfMissing(form: string, subject: string): string {
  const text = form.trim();
  if (/^(je|j['’]|tu|il|elle|on|nous|vous|ils|elles)\b/i.test(text)) {
    return text;
  }

  if (subject === "Je" && /^[aeiouyàâäéèêëîïôöùûüÿœæh]/i.test(text)) {
    return `J'${text}`;
  }

  return `${subject} ${text}`;
}
