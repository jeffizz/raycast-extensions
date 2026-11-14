import { environment } from "@raycast/api";
import { join } from "node:path";
import { sql, sqlite } from "./core/sqlite";
import { canonical, isNoun, Onset, Word } from "./core/model";
export type Candidate = {
  lemma: string;
  gender: string[];
  onset: Onset;
  forms: { text: string; genders: string[]; numbers: string[] }[];
};
export async function candidates(word: string): Promise<Candidate[]> {
  if (/\([^)]*\)/.test(word)) return [];
  const key = canonical(word).toLocaleLowerCase("fr");
  const raw = await sqlite(
    join(environment.assetsPath, "noun-lexicon.sqlite"),
    `SELECT e.data FROM forms f JOIN entries e ON e.id=f.entry_id WHERE f.form_key=${sql(key)} ORDER BY e.score DESC LIMIT 30;`,
    true,
  );
  const all: Candidate[] = JSON.parse(raw || "[]").map((r: { data: string }) =>
    JSON.parse(r.data),
  );
  const exact = all.filter(
    (c) => c.lemma === word || c.forms.some((f) => f.text === word),
  );
  return exact.length ? exact : all;
}
export async function enrichWord(w: Word) {
  if (!w.senses.some((s) => isNoun(s.pos))) return;
  const matches = await candidates(w.word);
  if (!matches.length) return;
  for (const s of w.senses.filter((s) => isNoun(s.pos))) {
    const genders = new Set(
      matches.flatMap((c) =>
        c.forms
          .filter(
            (f) =>
              canonical(f.text).toLocaleLowerCase("fr") ===
              canonical(w.word).toLocaleLowerCase("fr"),
          )
          .flatMap((f) => f.genders),
      ),
    );
    if (s.gender === "unknown" && genders.size === 1) {
      const g = [...genders][0];
      if (g === "m" || g === "f") {
        s.gender = g;
        s.genderSource = "LeXiK (automatic)";
      }
    }
    const filtered = matches.filter(
      (c) =>
        s.gender === "unknown" ||
        s.gender === "both" ||
        c.gender.includes(s.gender),
    );
    const onsets = new Set(filtered.map((c) => c.onset));
    if (s.onset === "unknown" && onsets.size === 1) s.onset = [...onsets][0];
  }
}
