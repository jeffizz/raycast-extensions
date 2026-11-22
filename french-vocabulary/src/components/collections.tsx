import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useForm } from "@raycast/utils";
import {
  collections,
  createCollection,
  renameCollection,
  deleteCollection,
} from "../core/collections";
import { autoBackup, report, store, useLibrary } from "../runtime";

export function CollectionNameForm({
  id,
  name = "",
  onSaved,
}: {
  id?: string;
  name?: string;
  onSaved: (id: string) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const { itemProps, handleSubmit } = useForm<{ name: string }>({
    initialValues: { name },
    validation: {
      name: (value) =>
        !value?.trim() ? "Enter a collection name." : undefined,
    },
    onSubmit: async (values) => {
      try {
        const savedId = await store.mutate((lib) => {
          if (id) {
            renameCollection(lib, id, values.name);
            return id;
          }
          return createCollection(lib, values.name);
        });
        await onSaved(savedId);
        void autoBackup();
        pop();
      } catch (error) {
        await report(error);
      }
    },
  });
  return (
    <Form
      navigationTitle={id ? "Rename Collection" : "Create Collection"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Collection" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Name" {...itemProps.name} />
    </Form>
  );
}
export function CollectionPicker({
  selected = "",
  allowAll = true,
  onSelect,
}: {
  selected?: string;
  allowAll?: boolean;
  onSelect: (id: string) => Promise<void>;
}) {
  const { lib, loading, refresh } = useLibrary(false);
  const { push, pop } = useNavigation();
  const choose = async (id: string) => {
    try {
      await onSelect(id);
      pop();
    } catch (error) {
      await report(error);
    }
  };
  return (
    <List isLoading={loading} navigationTitle="Choose Collection">
      {allowAll && (
        <List.Item
          title="All Words"
          icon={selected === "" ? Icon.CheckCircle : Icon.List}
          actions={
            <ActionPanel>
              <Action title="Use All Words" onAction={() => choose("")} />
            </ActionPanel>
          }
        />
      )}
      {collections(lib).map((c) => (
        <List.Item
          key={c.id}
          title={c.name}
          subtitle={String(c.wordIds.length) + " words"}
          icon={c.id === selected ? Icon.CheckCircle : Icon.Folder}
          actions={
            <ActionPanel>
              <Action title="Choose Collection" onAction={() => choose(c.id)} />
            </ActionPanel>
          }
        />
      ))}
      <List.Item
        title="Create New Collection"
        icon={Icon.Plus}
        actions={
          <ActionPanel>
            <Action
              title="Create Collection"
              onAction={() =>
                push(
                  <CollectionNameForm
                    onSaved={async (id) => {
                      await refresh();
                      await onSelect(id);
                      pop();
                    }}
                  />,
                )
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
export function ManageCollections({
  onChanged,
}: {
  onChanged?: () => Promise<void>;
}) {
  const { lib, loading, refresh: reload } = useLibrary(false);
  const refresh = async () => {
    await reload();
    await onChanged?.();
  };
  const { push } = useNavigation();
  const create = (
    <Action
      title="Create Collection"
      icon={Icon.Plus}
      onAction={() => push(<CollectionNameForm onSaved={refresh} />)}
    />
  );
  return (
    <List
      isLoading={loading}
      navigationTitle="Manage Collections"
      actions={<ActionPanel>{create}</ActionPanel>}
    >
      <List.EmptyView
        title="No Collections"
        description="Create a collection here, during import, or from Browse."
      />
      {collections(lib).map((c) => (
        <List.Item
          key={c.id}
          title={c.name}
          subtitle={String(c.wordIds.length) + " words"}
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <Action
                title="Rename Collection"
                onAction={() =>
                  push(
                    <CollectionNameForm
                      id={c.id}
                      name={c.name}
                      onSaved={refresh}
                    />,
                  )
                }
              />
              {create}
              <Action
                title="Delete Collection"
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (
                    !(await confirmAlert({
                      title: "Delete this collection?",
                      message:
                        "Only the collection and its membership are removed. Vocabulary, familiarity, FSRS and reviews stay unchanged.",
                      primaryAction: {
                        title: "Delete Collection",
                        style: Alert.ActionStyle.Destructive,
                      },
                    }))
                  )
                    return;
                  try {
                    await store.mutate((lib) => deleteCollection(lib, c.id));
                    await refresh();
                    void autoBackup();
                  } catch (error) {
                    await report(error);
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
