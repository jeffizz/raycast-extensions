import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useRef, useState } from "react";
import { autoBackup, report, store, useLibrary } from "../runtime";
import { searchKey, Word } from "../core/model";
import {
  linkPracticeConfusion,
  confusionWordTitle,
} from "../core/practice-confusion";

export function PracticeConfusion({ current }: { current: Word }) {
  const { lib, loading } = useLibrary(false);
  const { pop } = useNavigation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [destination, setDestination] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const selectionActions = (
    <>
      <Action
        title="Choose Group"
        onAction={async () => {
          if (!selected.length) {
            await report(Error("Select at least one other word."));
            return;
          }
          setGroupQuery("");
          setDestination(true);
        }}
      />
      <Action
        title={
          includeArchived ? "Hide Archived Words" : "Include Archived Words"
        }
        onAction={() => setIncludeArchived((value) => !value)}
      />
    </>
  );
  const saveGroup = async (groupId: string) => {
    if (lock.current || loading) return;
    lock.current = true;
    setBusy(true);
    try {
      const name = await store.mutate(
        (l) => linkPracticeConfusion(l, current.id, selected, groupId).name,
      );
      void autoBackup();
      await showToast({
        style: Toast.Style.Success,
        title: "Confusion Group Saved",
        message: name,
      });
      pop();
    } catch (error) {
      await report(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (destination) {
    const key = searchKey(groupQuery.trim());
    const groups = lib.groups.filter(
      (g) =>
        !key ||
        searchKey(g.name + " " + confusionWordTitle(lib, g.wordIds)).includes(
          key,
        ),
    );
    return (
      <List
        isLoading={busy || loading}
        filtering={false}
        navigationTitle="Add to Confusion Group"
        searchText={groupQuery}
        onSearchTextChange={setGroupQuery}
        searchBarPlaceholder="Search existing confusion groups…"
      >
        <List.Item
          id="create-group"
          title="Create New Group"
          icon={Icon.Plus}
          subtitle={confusionWordTitle(lib, [current.id, ...selected])}
          actions={
            <ActionPanel>
              <Action title="Create Group" onAction={() => saveGroup("")} />
              <Action
                title="Back to Word Search"
                onAction={() => setDestination(false)}
              />
            </ActionPanel>
          }
        />
        {groups.map((g) => (
          <List.Item
            key={g.id}
            id={g.id}
            title={g.name}
            accessories={[{ text: `${g.wordIds.length} words` }]}
            actions={
              <ActionPanel>
                <Action title="Add to Group" onAction={() => saveGroup(g.id)} />
                <Action
                  title="Back to Word Search"
                  onAction={() => setDestination(false)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List>
    );
  }
  const key = searchKey(query.trim());
  const words = lib.words.filter(
    (w) =>
      w.id !== current.id &&
      (includeArchived || !w.archived) &&
      (!key ||
        searchKey(
          [w.word, ...w.senses.flatMap((s) => [s.pos, s.zh, s.en])].join(" "),
        ).includes(key)),
  );
  return (
    <List
      isLoading={loading}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      navigationTitle={`Link with ${current.word} · ${selected.length} selected`}
      searchBarPlaceholder="Search all library words, including words outside practice…"
      actions={<ActionPanel>{selectionActions}</ActionPanel>}
    >
      <List.EmptyView
        title="No Matching Words"
        description="Search the whole library or include archived words from Actions."
      />
      <List.Section title={`${words.length} matches · showing up to 80`}>
        {words.slice(0, 80).map((w) => (
          <List.Item
            key={w.id}
            id={w.id}
            title={w.word}
            subtitle={w.senses
              .map((s) => [s.pos, s.zh || s.en].filter(Boolean).join(" · "))
              .join(" / ")}
            icon={selected.includes(w.id) ? Icon.Checkmark : Icon.Circle}
            accessories={
              w.archived ? [{ icon: Icon.Tray, tooltip: "Archived" }] : []
            }
            actions={
              <ActionPanel>
                <Action
                  title={
                    selected.includes(w.id) ? "Deselect Word" : "Select Word"
                  }
                  onAction={() => toggle(w.id)}
                />
                {selectionActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
