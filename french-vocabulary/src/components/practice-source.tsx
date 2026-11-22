import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";
import { Library, Mode, PracticeSourceFilters } from "../core/model";
import { collections, collectionSelectionIds } from "../core/collections";
import { modeSettings, practiceSourceFilters } from "../core/practice-settings";
import { autoBackup, report, store } from "../runtime";

type Values = {
  collectionIds: string[];
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
      collectionIds: collectionSelectionIds(filters.collectionId),
    },
    onSubmit: async (values) => {
      try {
        if (
          values.collectionIds.some(
            (id) => !collections(library).some((c) => c.id === id),
          )
        )
          throw Error(
            "This collection was deleted. Choose All Words or another collection.",
          );
        await store.mutate((lib) => {
          if (
            values.collectionIds.some(
              (id) => !collections(lib).some((c) => c.id === id),
            )
          )
            throw Error("The collection no longer exists.");
          lib.settings ??= {};
          lib.settings.practice ??= {};
          lib.settings.practice[mode] = {
            ...modeSettings(lib, mode),
            scope: "default",
            wordIds: [],
            sourceFilters: {
              collectionId: "",
              collectionIds: [...new Set(values.collectionIds)],
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
      <Form.TagPicker
        title="Collections"
        info="Match any selected collection. Leave empty for all words."
        {...itemProps.collectionIds}
      >
        {collectionSelectionIds(filters.collectionId)
          .filter((id) => !collections(library).some((c) => c.id === id))
          .map((id) => (
            <Form.TagPicker.Item
              key={id}
              value={id}
              title="Deleted Collection — Remove"
            />
          ))}
        {collections(library).map((c) => (
          <Form.TagPicker.Item key={c.id} value={c.id} title={c.name} />
        ))}
      </Form.TagPicker>
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
