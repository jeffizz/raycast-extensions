import { Library, validateLibrary } from "./model";
import { createHash } from "node:crypto";

export const collections = ["words", "groups", "cards", "reviews"] as const;
type Collection = (typeof collections)[number];
export type Baseline = {
  libraryId: string;
  revision: number;
  hashes: Record<Collection, Record<string, string>>;
};
export type Delta = {
  format: 1;
  libraryId: string;
  from: number;
  to: number;
  settings: Library["settings"];
  changes: Record<Collection, { upsert: { id: string }[]; order: string[] }>;
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function baseline(lib: Library): Baseline {
  return {
    libraryId: lib.libraryId,
    revision: lib.revision,
    hashes: Object.fromEntries(
      collections.map((key) => [
        key,
        Object.fromEntries(lib[key].map((row) => [row.id, hash(row)])),
      ]),
    ) as Baseline["hashes"],
  };
}
export function makeDelta(before: Baseline, lib: Library): Delta {
  if (before.libraryId !== lib.libraryId || before.revision >= lib.revision)
    throw Error("Invalid incremental backup baseline.");
  return {
    format: 1,
    libraryId: lib.libraryId,
    from: before.revision,
    to: lib.revision,
    settings: lib.settings,
    changes: Object.fromEntries(
      collections.map((key) => [
        key,
        {
          upsert: lib[key].filter(
            (row) => before.hashes[key][row.id] !== hash(row),
          ),
          order: lib[key].map((row) => row.id),
        },
      ]),
    ) as unknown as Delta["changes"],
  };
}
export function applyDelta(lib: Library, delta: Delta): Library {
  if (
    !delta ||
    delta.format !== 1 ||
    delta.libraryId !== lib.libraryId ||
    delta.from !== lib.revision ||
    !Number.isSafeInteger(delta.to) ||
    delta.to <= delta.from
  )
    throw Error("Broken incremental backup chain.");
  const result = structuredClone(lib);
  for (const key of collections) {
    const change = delta.changes?.[key];
    if (
      !change ||
      !Array.isArray(change.upsert) ||
      !Array.isArray(change.order) ||
      new Set(change.order).size !== change.order.length ||
      change.order.some((id) => typeof id !== "string")
    )
      throw Error("Invalid incremental backup rows.");
    const rows = new Map<string, unknown>(lib[key].map((row) => [row.id, row]));
    for (const row of change.upsert) {
      if (!row || typeof row.id !== "string")
        throw Error("Invalid incremental backup row.");
      rows.set(row.id, row);
    }
    (result[key] as unknown[]) = change.order.map((id) => {
      if (!rows.has(id)) throw Error("Missing incremental backup row.");
      return rows.get(id);
    });
  }
  if (delta.settings === undefined) delete result.settings;
  else result.settings = delta.settings;
  result.revision = delta.to;
  validateLibrary(result);
  return result;
}
