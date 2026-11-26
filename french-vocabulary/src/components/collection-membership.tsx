import {
  Action,
  ActionPanel,
  Icon,
  List,
  useNavigation,
  showToast,
  Toast,
} from "@raycast/api";
import { useRef, useState } from "react";
import { Library } from "../core/model";
import {
  membershipState,
  applyMembershipEdits,
} from "../core/collection-membership";
import { store, report, autoBackup } from "../runtime";

export function CollectionMembershipEditor({
  library,
  ids,
  onSaved,
  addOnly = false,
}: {
  library: Library;
  addOnly?: boolean;
  ids: string[];
  onSaved: () => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { pop } = useNavigation();
  const all = library.settings?.collections ?? [];
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (Object.keys(edits).length)
        await store.updateSettings(library.libraryId, (lib) =>
          applyMembershipEdits(lib, ids, edits, all, addOnly),
        );
      await onSaved();
      if (Object.keys(edits).length) void autoBackup();
      await showToast({
        style: Toast.Style.Success,
        title: "Collections Updated",
      });
      pop();
    } catch (error) {
      await report(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const saveAction = (
    <Action title="Save Changes" icon={Icon.Checkmark} onAction={save} />
  );
  return (
    <List
      isLoading={busy}
      navigationTitle={addOnly ? "Add to Collections" : "Edit Word Collections"}
      searchBarPlaceholder="Search collections…"
      actions={<ActionPanel>{saveAction}</ActionPanel>}
    >
      <List.EmptyView
        title="No Collections"
        description="Create a collection in Manage Collections first."
      />
      <List.Section
        title={
          ids.length +
          (addOnly
            ? " word(s) · Add only · Existing memberships are preserved"
            : " word(s) · Return toggles · Save Changes applies edits")
        }
      >
        {all.map((collection) => {
          const initial = membershipState(collection, ids);
          const changed = Object.hasOwn(edits, collection.id);
          const state = changed
            ? edits[collection.id]
              ? "all"
              : "none"
            : initial;
          const choose = (value: boolean) =>
            setEdits((prev) => ({ ...prev, [collection.id]: value }));
          return (
            <List.Item
              key={collection.id}
              title={collection.name}
              icon={
                state === "all"
                  ? Icon.CheckCircle
                  : state === "mixed"
                    ? Icon.Minus
                    : Icon.Circle
              }
              accessories={[
                {
                  text:
                    state === "all"
                      ? "Selected"
                      : state === "mixed"
                        ? "Mixed"
                        : "Not Selected",
                  tooltip:
                    state === "mixed"
                      ? "Only some selected words belong to this collection; unchanged until explicitly edited."
                      : undefined,
                },
                ...(changed
                  ? [{ icon: Icon.Pencil, tooltip: "Unsaved change" }]
                  : []),
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title={
                      addOnly
                        ? changed
                          ? "Cancel Pending Addition"
                          : initial === "all"
                            ? "Already in Collection"
                            : "Add to Collection"
                        : state === "all"
                          ? "Remove from Collection"
                          : "Add to Collection"
                    }
                    onAction={() => {
                      if (!addOnly) choose(state !== "all");
                      else if (changed)
                        setEdits((prev) => {
                          const next = { ...prev };
                          delete next[collection.id];
                          return next;
                        });
                      else if (initial !== "all") choose(true);
                    }}
                  />
                  {saveAction}
                  <Action
                    title="Add All Selected Words"
                    onAction={() => choose(true)}
                  />
                  {!addOnly && (
                    <Action
                      title="Remove All Selected Words"
                      onAction={() => choose(false)}
                    />
                  )}
                  {changed && (
                    <Action
                      title="Reset This Change"
                      onAction={() =>
                        setEdits((prev) => {
                          const next = { ...prev };
                          delete next[collection.id];
                          return next;
                        })
                      }
                    />
                  )}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
