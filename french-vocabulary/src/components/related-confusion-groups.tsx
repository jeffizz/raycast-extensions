import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { preferences, useLibrary } from "../runtime";
import { comparison } from "../core/presentation";
import { PracticeConfusion } from "./practice-confusion";

export function RelatedConfusionGroups({ wordId }: { wordId: string }) {
  const { lib, loading, refresh } = useLibrary(false);
  const { push } = useNavigation();
  const word = lib.words.find((w) => w.id === wordId);
  const groups = lib.groups.filter((g) => g.wordIds.includes(wordId));
  const addAction =
    word && !loading ? (
      <Action
        title="Add to Confusion Group"
        icon={Icon.Plus}
        onAction={() =>
          push(<PracticeConfusion current={word} onSaved={refresh} />)
        }
      />
    ) : null;
  return (
    <List
      isLoading={loading}
      navigationTitle={`Confusion Groups · ${word?.word ?? ""}`}
      searchBarPlaceholder="Search related confusion groups…"
      actions={
        <ActionPanel>
          {addAction}
          <Action title="Refresh" onAction={refresh} />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title="No Related Confusion Groups"
        description="Use Add to Confusion Group to link this word with other words."
      />
      {groups.map((group) => (
        <List.Item
          key={group.id}
          id={group.id}
          title={group.name}
          accessories={[{ text: `${group.wordIds.length} words` }]}
          actions={
            <ActionPanel>
              <Action
                title="Open Group Details"
                icon={Icon.List}
                onAction={() =>
                  push(<RelatedGroupDetails groupId={group.id} />)
                }
              />
              {addAction}
              <Action title="Refresh" onAction={refresh} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function RelatedGroupDetails({ groupId }: { groupId: string }) {
  const { lib, loading, refresh } = useLibrary(false);
  const group = lib.groups.find((g) => g.id === groupId);
  const members = new Set(group?.wordIds);
  const words = lib.words.filter((w) => members.has(w.id));
  return (
    <Detail
      isLoading={loading}
      navigationTitle={group?.name ?? "Confusion Group"}
      markdown={
        group
          ? comparison(words, preferences().languageMode) +
            (group.notes ? "\n\n" + group.notes : "")
          : "This confusion group no longer exists."
      }
      actions={
        <ActionPanel>
          <Action title="Refresh" onAction={refresh} />
        </ActionPanel>
      }
    />
  );
}
