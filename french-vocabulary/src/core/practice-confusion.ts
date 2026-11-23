import { Library, now, uid } from "./model";

export function confusionWordTitle(lib: Library, ids: string[]) {
  const words = new Map(lib.words.map((w) => [w.id, w.word]));
  return [
    ...new Set(
      ids.map((id) => words.get(id)).filter((word): word is string => !!word),
    ),
  ].join(", ");
}
export function linkPracticeConfusion(
  lib: Library,
  currentId: string,
  otherIds: string[],
  groupId: string,
) {
  const ids = [...new Set([currentId, ...otherIds])];
  if (ids.some((id) => !lib.words.some((w) => w.id === id)))
    throw Error("A selected word no longer exists. Reopen the search.");
  if (groupId) {
    const group = lib.groups.find((g) => g.id === groupId);
    if (!group)
      throw Error("This group no longer exists. Choose another group.");
    const members = [...new Set([...group.wordIds, ...ids])];
    if (members.some((id) => !lib.words.some((w) => w.id === id)))
      throw Error("A group member no longer exists. Refresh the group.");
    group.wordIds = members;
    group.name = confusionWordTitle(lib, members);
    group.updatedAt = now();
    return group;
  }
  if (ids.length < 2) throw Error("Select at least one other word.");
  const group = {
    id: uid(),
    name: confusionWordTitle(lib, ids),
    wordIds: ids,
    notes: "",
    updatedAt: now(),
  };
  lib.groups.push(group);
  return group;
}
