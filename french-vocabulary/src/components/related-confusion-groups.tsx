import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { useLibrary } from "../runtime";
import { GroupDetails } from "./group-details";
import { PracticeConfusion } from "./practice-confusion";

export function RelatedConfusionGroups({
  wordId,
  viewOnly = false,
}: {
  wordId: string;
  viewOnly?: boolean;
}) {
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
  if (word && !viewOnly)
    return (
      <PracticeConfusion
        current={word}
        onSaved={refresh}
        onViewGroups={() =>
          push(<RelatedConfusionGroups wordId={wordId} viewOnly />)
        }
      />
    );
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
                onAction={() => push(<GroupDetails groupId={group.id} />)}
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
