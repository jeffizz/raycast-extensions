import {
  Action,
  ActionPanel,
  confirmAlert,
  Alert,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { autoBackup, preferences, report, store, useLibrary } from "./runtime";
import { GroupEditor } from "./components/word";
import { comparison } from "./core/presentation";
import { PracticeMenu } from "./practice";
import { GroupDetails } from "./components/group-details";
export default function Groups() {
  const { lib, loading, refresh } = useLibrary(false),
    { push, pop } = useNavigation();
  const [selection, setSelection] = useState<string>();
  return (
    <List
      isLoading={loading}
      isShowingDetail
      navigationTitle="Confusion Groups"
      selectedItemId={selection}
      onSelectionChange={(id) => setSelection(id ?? undefined)}
      actions={
        <ActionPanel>
          <Action
            title="Create Confusion Group"
            icon={Icon.Plus}
            onAction={() =>
              push(
                <GroupEditor
                  onSaved={async () => {
                    await refresh();
                    pop();
                  }}
                />,
              )
            }
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title="No confusion groups yet"
        description="Find similar words in Browse, or create a group from the Action Panel."
      />
      {lib.groups.map((g) => (
        <List.Item
          key={g.id}
          id={g.id}
          title={g.name}
          accessories={[{ text: `${g.wordIds.length} words` }]}
          detail={
            <List.Item.Detail
              markdown={`${comparison(
                g.wordIds
                  .map((id) => lib.words.find((w) => w.id === id))
                  .filter((w) => !!w),
                preferences().languageMode,
              )}${g.notes ? `\n\n${g.notes}` : ""}`}
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Browse Group Members"
                icon={Icon.List}
                onAction={() => push(<GroupDetails groupId={g.id} />)}
              />
              <Action
                title="Edit Group and Comparison Notes"
                icon={Icon.Pencil}
                onAction={() =>
                  push(
                    <GroupEditor
                      group={g}
                      onSaved={async () => {
                        await refresh();
                        pop();
                      }}
                    />,
                  )
                }
              />
              <Action
                title="Practice Included Group Words"
                icon={Icon.Play}
                onAction={() => push(<PracticeMenu wordIds={g.wordIds} />)}
              />
              <Action
                title="Create Confusion Group"
                icon={Icon.Plus}
                onAction={() =>
                  push(
                    <GroupEditor
                      onSaved={async () => {
                        await refresh();
                        pop();
                      }}
                    />,
                  )
                }
              />
              <Action
                title="Delete Group"
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (
                    !(await confirmAlert({
                      title: "Delete this confusion group?",
                      message:
                        "Vocabulary and learning records will not be deleted.",
                      primaryAction: {
                        title: "Delete Group",
                        style: Alert.ActionStyle.Destructive,
                      },
                    }))
                  )
                    return;
                  try {
                    await store.mutate((l) => {
                      l.groups = l.groups.filter((x) => x.id !== g.id);
                    });
                    await refresh();
                    await autoBackup();
                  } catch (e) {
                    await report(e);
                  }
                }}
              />
              <Action title="Refresh" onAction={refresh} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
