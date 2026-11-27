import { canonical, Library, newWord, now, uid, Word } from "../core/model";
import { Candidate, candidateSense, Task } from "./core";
export function candidateSaveSummary(options: {
  count: number;
  replacements: number;
  notesDestination?: "group notes" | "the word's mnemonic";
  append: boolean;
  collectionName?: string;
}) {
  const { count, replacements, notesDestination, append, collectionName } =
    options;
  const selection = `Selected candidates: ${count}.`;
  if (notesDestination === "group notes") {
    return `${selection}\nReplace group notes.`;
  }
  if (notesDestination) {
    return `${selection}\n${append ? "Append to" : "Replace"} ${notesDestination}.`;
  }
  const collection = collectionName?.replace(/\s+/g, " ").trim();
  const destination = collection
    ? `\nCollection: ${collection.length > 40 ? collection.slice(0, 39) + "…" : collection}`
    : "";
  return `${selection}\nAdd: ${count - replacements}. Replace: ${replacements}.${destination}`;
}
export function saveAI(
  lib: Library,
  options: {
    word?: Word;
    spelling: string;
    task: Task;
    items: Candidate[];
    targets: string[];
    collectionId?: string;
    groupId?: string;
    groupBefore?: string;
    append?: boolean;
    senseId?: string;
    provider?: string;
    model?: string;
    generatedAt?: string;
    separatePronominal?: boolean;
  },
) {
  const { task, items, targets } = options;
  const source = {
    kind: "ai" as const,
    provider: options.provider,
    model: options.model,
    at: options.generatedAt ?? now(),
  };
  if (!items.length) throw Error("Select at least one candidate.");
  if (options.groupId) {
    const group = lib.groups.find((g) => g.id === options.groupId);
    if (!group || JSON.stringify(group) !== options.groupBefore)
      throw Error("Group changed. Reopen AI preview.");
    group.notes = items.map((i) => i.text ?? "").join("\n\n");
    group.updatedAt = now();
    return;
  }
  let word = options.word
    ? lib.words.find((w) => w.id === options.word!.id)
    : undefined;
  if (
    options.word &&
    (!word ||
      JSON.stringify(word.senses) !== JSON.stringify(options.word.senses) ||
      word.mnemonic !== options.word.mnemonic ||
      word.collocations !== options.word.collocations ||
      JSON.stringify(word.collocationEntries) !==
        JSON.stringify(options.word.collocationEntries) ||
      JSON.stringify(word.examples) !== JSON.stringify(options.word.examples))
  )
    throw Error("Word content changed. Reopen AI preview.");
  if (!word) {
    if (task !== "senses") throw Error("Choose an existing word.");
    if (
      lib.words.some(
        (w) =>
          canonical(w.word).toLowerCase() ===
          canonical(options.spelling).toLowerCase(),
      )
    )
      throw Error("Word already exists. Open its AI Senses action instead.");
    word = newWord(options.spelling, candidateSense(items[0]));
    word.senses = [];
    lib.words.push(word);
  }
  if (task === "senses") {
    const replaced = new Set<string>();
    items.forEach((item, i) => {
      const headword = item.headword ? canonical(item.headword) : "";
      if (
        options.separatePronominal !== false &&
        /^(se\s|s['’])/i.test(headword) &&
        headword.toLocaleLowerCase("fr") !==
          canonical(word!.word).toLocaleLowerCase("fr")
      ) {
        const sense = { ...candidateSense(item), source };
        let destination = lib.words.find(
          (w) =>
            canonical(w.word).toLocaleLowerCase("fr") ===
            headword.toLocaleLowerCase("fr"),
        );
        if (!destination) {
          destination = newWord(headword, sense);
          lib.words.push(destination);
        } else if (
          !destination.senses.some(
            (s) =>
              s.pos === sense.pos && s.zh === sense.zh && s.en === sense.en,
          )
        ) {
          destination.senses.push(sense);
        }
        destination.updatedAt = now();
        if (options.collectionId) {
          const collection = lib.settings?.collections?.find(
            (c) => c.id === options.collectionId,
          );
          if (!collection) throw Error("Collection no longer exists.");
          collection.wordIds = [
            ...new Set([...collection.wordIds, destination.id]),
          ];
        }
        return;
      }
      const target = targets[i] ?? "";
      if (target) {
        if (replaced.has(target))
          throw Error("Assign each existing sense at most once.");
        replaced.add(target);
        const index = word!.senses.findIndex((s) => s.id === target);
        if (index < 0) throw Error("Target sense no longer exists.");
        word!.senses[index] = {
          ...word!.senses[index],
          pos: item.pos!,
          ipa: item.ipa!,
          zh: item.zh!,
          en: item.en!,
          source,
          onset:
            word!.senses[index].onset === "unknown"
              ? candidateSense(item).onset
              : word!.senses[index].onset,
        };
      } else {
        const sense = { ...candidateSense(item), source };
        if (
          !word!.senses.some(
            (s) =>
              s.pos === sense.pos && s.zh === sense.zh && s.en === sense.en,
          )
        )
          word!.senses.push(sense);
      }
    });
  } else if (task === "examples") {
    for (const c of items)
      if (
        !word.examples.some(
          (e) => e.french === c.french && e.translation === c.translation,
        )
      )
        word.examples.push({
          id: uid(),
          french: c.french!,
          translation: c.translation!,
          senseId: options.senseId,
        });
  } else if (task === "collocations") {
    if (!options.senseId || !word.senses.some((s) => s.id === options.senseId))
      throw Error("Select an existing target sense.");
    word.collocationEntries ??= [];
    for (const c of items) {
      if (!c.pattern || !c.meaning || !c.french || !c.translation)
        throw Error("Incomplete collocation.");
      if (
        !word.collocationEntries.some(
          (e) =>
            e.senseId === options.senseId &&
            canonical(e.pattern) === canonical(c.pattern!),
        )
      )
        word.collocationEntries.push({
          id: uid(),
          senseId: options.senseId,
          pattern: c.pattern,
          meaning: c.meaning,
          preposition: c.preposition || undefined,
          french: c.french,
          translation: c.translation,
          source,
          createdAt: now(),
        });
    }
  } else if (task === "mnemonic" || task === "history") {
    const text = items.map((i) => i.text ?? "").join("\n\n");
    const field = task === "history" ? "mnemonic" : task;
    word[field] =
      options.append && word[field] ? word[field] + "\n\n" + text : text;
  }
  if (!options.word && !word.senses.length) {
    lib.words = lib.words.filter((w) => w.id !== word!.id);
    return;
  }
  if (options.collectionId) {
    const collection = lib.settings?.collections?.find(
      (c) => c.id === options.collectionId,
    );
    if (!collection) throw Error("Collection no longer exists.");
    collection.wordIds = [...new Set([...collection.wordIds, word.id])];
  }
  word.updatedAt = now();
}
