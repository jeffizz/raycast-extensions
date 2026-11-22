import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";
import { Library, Mode, PracticeSourceFilters } from "../core/model";
import { collections } from "../core/collections";
import { modeSettings, practiceSourceFilters } from "../core/practice-settings";
import { autoBackup, report, store } from "../runtime";

type Values = {
  scope: string;
  collectionId: string;
  pos: string;
  familiarity: string;
};
export function PracticeSource({
  library,
  mode,
  refresh,
}: {
  library: Library;
  mode: Mode;
  refresh: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const settings = modeSettings(library, mode);
  const filters = practiceSourceFilters(settings);
  const { itemProps, handleSubmit } = useForm<Values>({
    initialValues: {
      ...filters,
      scope: settings.scope === "selected" ? "selected" : "default",
    },
    onSubmit: async (values) => {
      try {
        if (
          values.collectionId &&
          !collections(library).some((c) => c.id === values.collectionId)
        )
          throw Error(
            "This collection was deleted. Choose All Words or another collection.",
          );
        await store.mutate((lib) => {
          if (
            values.collectionId &&
            !collections(lib).some((c) => c.id === values.collectionId)
          )
            throw Error("The collection no longer exists.");
          lib.settings ??= {};
          lib.settings.practice ??= {};
          lib.settings.practice[mode] = {
            ...modeSettings(lib, mode),
            scope: values.scope as "default" | "selected",
            sourceFilters: {
              collectionId: values.collectionId,
              pos: values.pos as PracticeSourceFilters["pos"],
              familiarity:
                values.familiarity as PracticeSourceFilters["familiarity"],
            },
          };
        });
        await refresh();
        void autoBackup();
        pop();
      } catch (error) {
        await report(error);
      }
    },
  });
  return (
    <Form
      navigationTitle="Practice Source"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Practice Source"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Filters combine, just like Browse. Settings are saved separately for each mode. Archived words and words excluded from practice remain ineligible. FSRS due dates and daily limits still apply. New sessions use these filters; Resume keeps the saved queue." />
      <Form.Dropdown title="Word Library" {...itemProps.scope}>
        <Form.Dropdown.Item value="default" title="Default Library" />
        <Form.Dropdown.Item value="selected" title="Selected Words Only" />
      </Form.Dropdown>
      <Form.Dropdown title="Collection" {...itemProps.collectionId}>
        <Form.Dropdown.Item value="" title="All Words" />
        {filters.collectionId &&
          !collections(library).some((c) => c.id === filters.collectionId) && (
            <Form.Dropdown.Item
              value={filters.collectionId}
              title="Deleted Collection — Choose Another"
            />
          )}
        {collections(library).map((c) => (
          <Form.Dropdown.Item key={c.id} value={c.id} title={c.name} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown title="Part of Speech" {...itemProps.pos}>
        <Form.Dropdown.Item value="all" title="All" />
        <Form.Dropdown.Item value="noun" title="Nouns" />
        <Form.Dropdown.Item value="verb" title="Verbs" />
        <Form.Dropdown.Item value="adjective" title="Adjectives" />
        <Form.Dropdown.Item value="adverb" title="Adverbs" />
      </Form.Dropdown>
      <Form.Dropdown title="Familiarity" {...itemProps.familiarity}>
        <Form.Dropdown.Item value="all" title="All" />
        <Form.Dropdown.Item value="unmarked" title="No Status" />
        <Form.Dropdown.Item value="fuzzy" title="Fuzzy" />
        <Form.Dropdown.Item value="known" title="Know" />
      </Form.Dropdown>
    </Form>
  );
}
