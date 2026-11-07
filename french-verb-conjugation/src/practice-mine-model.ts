import { book } from "./data";
import { ROWS } from "./model";

export type Mode = "parts" | 0 | 1 | 2 | 3 | 4 | 5;
// Keep "tenses" as the persisted value for the verb-column layout for backward compatibility.
export type Layout = "tenses" | "persons";

export function pageSize(layout: Layout) {
  return layout === "persons" ? 5 : 6;
}
export type Slot = { verb: string; mode: Mode; row: number };

export function slotId(slot: Slot) {
  return JSON.stringify([slot.verb, slot.mode, slot.row]);
}

export function expected(slot: Slot): string[] | null {
  const forms = book.verbs[slot.verb];
  if (!forms) return null;
  const values = slot.mode === "parts" ? (slot.row === 0 ? forms.pp : slot.row === 1 ? forms.prp : null) : forms.t[slot.mode]?.[slot.row];
  return values?.length ? values : null;
}

export function slotsForVerb(verb: string, mode: Mode): Slot[] {
  return Array.from({ length: mode === "parts" ? 2 : ROWS.length }, (_, row) => ({ verb, mode, row }));
}

// Caller must provide a non-empty page.
export function firstSlot(verbs: string[], mode: Mode): Slot {
  const slots = verbs.flatMap((verb) => slotsForVerb(verb, mode));
  if (!slots.length) throw new Error("Cannot select a slot on an empty page");
  return slots.find((slot) => expected(slot)) ?? slots[0];
}

export function pageOf(verbs: string[], page: number, layout: Layout) {
  const size = pageSize(layout);
  return verbs.slice(page * size, (page + 1) * size);
}

export function pageForVerb(verbs: string[], verb: string, layout: Layout) {
  const index = verbs.indexOf(verb);
  return index < 0 ? 0 : Math.floor(index / pageSize(layout));
}

export function gridRows(verbs: string[], mode: Mode, layout: Layout): Slot[][] {
  const count = mode === "parts" ? 2 : ROWS.length;
  return layout === "tenses"
    ? Array.from({ length: count }, (_, row) => verbs.map((verb) => ({ verb, mode, row })))
    : verbs.map((verb) => slotsForVerb(verb, mode));
}
