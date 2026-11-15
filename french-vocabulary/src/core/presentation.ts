import { Library, Word, Sense, searchKey, mnemonicPhrases } from "./model";
export type LanguageMode = "zh-first" | "en-first" | "zh-only" | "en-only";
export const md = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
const cell = (s: string) => md(s).replace(/\r?\n/g, "<br>");
export function translationValues(s: Sense, mode: LanguageMode = "zh-first") {
  const zh = s.zh.trim(),
    en = s.en.trim();
  return mode === "zh-only"
    ? [zh]
    : mode === "en-only"
      ? [en]
      : mode === "en-first"
        ? [en, zh]
        : [zh, en];
}
export function translations(
  s: Sense,
  mode: LanguageMode = "zh-first",
  empty = false,
) {
  return (
    translationValues(s, mode).filter(Boolean).map(md).join("\n\n") ||
    (empty ? "—" : "")
  );
}
export function senseMarkdown(
  s: Sense,
  language: LanguageMode = "zh-first",
  showIPA = false,
) {
  const lines = [
    `(${md(s.pos || "—")})`,
    ...translationValues(s, language).filter(Boolean).map(md),
  ];
  if (lines.length === 1) lines.push("—");
  if (showIPA && s.ipa) lines.push(md(s.ipa));
  return lines.join("  \n");
}
export function wordDetails(
  w: Word,
  showIPA = false,
  language: LanguageMode = "zh-first",
) {
  const phrases = mnemonicPhrases(w);
  return `${phrases.length ? `*${phrases.map(md).join(" · ")}*\n\n` : ""}${w.senses.map((s) => senseMarkdown(s, language, showIPA)).join("\n\n---\n\n")}${w.notes ? `\n\n## Notes\n\n${w.notes}` : ""}${w.examples.length ? `\n\n## Examples\n\n${w.examples.map((e) => `* ${md(e.french)}${e.translation ? `\n  ${md(e.translation)}` : ""}`).join("\n\n")}` : ""}`;
}
export function detailMarkdown(
  w: Word,
  showIPA = false,
  language: LanguageMode = "zh-first",
) {
  return `# ${md(w.word)}\n\n${wordDetails(w, showIPA, language)}`;
}
export function spellingMarkdown(
  w: Word,
  expected: string,
  answer: string,
  revealed: boolean,
  language: LanguageMode = "zh-first",
  copy = false,
) {
  // Recall spelling must not reveal the target or article phrases before checking.
  const title =
    copy || revealed ? (copy ? expected : w.word) : "Recall Spelling";
  const details =
    copy || revealed
      ? wordDetails(w, false, language)
      : w.senses.map((s) => senseMarkdown(s, language)).join("\n\n---\n\n");
  return `# ${md(title)}\n\n${revealed ? `${spellingDiff(answer, expected)}\n\n` : ""}${details}`;
}
export function groupName(words: Word[]) {
  return words.map((w) => w.word).join(" · ");
}
export function comparison(words: Word[], language: LanguageMode = "zh-first") {
  if (!words.length) return "";
  const count = language === "zh-only" || language === "en-only" ? 3 : 4;
  const rows = words.map((w) => {
    const pos = w.senses.map((s) => cell(s.pos)).join("<br><br>");
    const values = Array.from({ length: count - 2 }, (_, i) =>
      w.senses
        .map((s) => cell(translationValues(s, language)[i] || "—"))
        .join("<br><br>"),
    );
    return `| **${cell(w.word)}** | ${pos} | ${values.join(" | ")} |`;
  });
  return `| ${Array(count).fill("").join(" | ")} |\n| ${Array(count).fill("---").join(" | ")} |\n${rows.join("\n")}`;
}
export function importConflictMarkdown(
  word: string,
  incoming: Sense,
  candidates: Sense[],
) {
  const fields = ["pos", "ipa", "zh", "en"] as const;
  const tables = candidates.map(
    (existing, index) =>
      `## Existing Sense ${index + 1}\n\n| Existing | Incoming |\n| --- | --- |\n${fields
        .map(
          (key) =>
            `| ${cell(existing[key]) || "—"} | ${cell(incoming[key]) || "—"} |`,
        )
        .join("\n")}`,
  );
  return `# ${md(word)}\n\n${tables.join("\n\n")}\n\nChoose Keep Existing, Update Existing Sense, or Add as New Sense. Updates preserve the sense ID and review records; empty imported fields do not erase existing values.`;
}
export function spellingDiff(answer: string, expected: string) {
  return `| |\n| --- |\n| ${cell(expected) || "—"} |\n| ${cell(answer) || "—"} |`;
}
export const sortModes = [
  ["activity", "Recently Used"],
  ["import", "Import Order"],
  ["import-desc", "Import Order (Reverse)"],
  ["alphabetical", "A → Z"],
  ["random", "Random"],
] as const;
export function sortWords(
  words: Word[],
  lib: Library,
  mode: string,
  random: Map<string, number>,
) {
  const position = new Map(lib.words.map((w, i) => [w.id, i]));
  return [...words].sort((a, b) =>
    mode === "import"
      ? position.get(a.id)! - position.get(b.id)!
      : mode === "import-desc"
        ? position.get(b.id)! - position.get(a.id)!
        : mode === "alphabetical"
          ? a.word.localeCompare(b.word, "fr")
          : mode === "random"
            ? (random.get(a.id) ?? 0) - (random.get(b.id) ?? 0)
            : Math.max(
                Date.parse(b.updatedAt) || 0,
                Date.parse(b.lastViewedAt || "") || 0,
              ) -
                Math.max(
                  Date.parse(a.updatedAt) || 0,
                  Date.parse(a.lastViewedAt || "") || 0,
                ) || position.get(b.id)! - position.get(a.id)!,
  );
}
export const matchesSearch = (w: Word, q: string) =>
  !q ||
  searchKey(
    [
      w.word,
      ...w.senses.flatMap((s) => [s.en, s.zh, s.pos]),
      w.notes,
      ...w.tags,
    ].join(" "),
  ).includes(searchKey(q));
export function recentMistakes(lib: Library) {
  const latest = new Map<string, number>();
  for (const r of lib.reviews)
    if (!r.correct && r.mode !== "copy") {
      const at = Date.parse(r.at);
      if (Number.isFinite(at))
        latest.set(r.wordId, Math.max(latest.get(r.wordId) ?? -Infinity, at));
    }
  const anchor = Math.max(...latest.values());
  return [...latest]
    .filter(([, at]) => anchor - at <= 7 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
