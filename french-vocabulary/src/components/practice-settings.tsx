import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { Mode } from "../core/model";
import { modeSettings, practiceModes } from "../core/practice-settings";
import { matchesSearch } from "../core/presentation";
import { autoBackup, report, store, useLibrary } from "../runtime";

export function PracticeSettings({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const { lib, loading, refresh } = useLibrary(false);
  const { push } = useNavigation();
  return (
    <List isLoading={loading} navigationTitle="Practice Settings">
      {practiceModes.map(({ mode, title }) => {
        const setting = modeSettings(lib, mode);
        return (
          <List.Item
            key={mode}
            title={title}
            icon={Icon.Gear}
            accessories={[
              {
                text: `Audio ${setting.autoSpeak ? "on" : "off"} · ${setting.scope === "default" ? "Default library" : `${setting.wordIds.length} selected`}`,
              },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Configure Mode"
                  onAction={() =>
                    push(
                      <ModeForm
                        mode={mode}
                        title={title}
                        onSaved={async () => {
                          await refresh();
                          await onSaved();
                        }}
                      />,
                    )
                  }
                />
                <Action
                  title="Select Words"
                  onAction={() =>
                    push(
                      <ModeWords
                        mode={mode}
                        title={title}
                        onSaved={async () => {
                          await refresh();
                          await onSaved();
                        }}
                      />,
                    )
                  }
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
function ModeForm({
  mode,
  title,
  onSaved,
}: {
  mode: Mode;
  title: string;
  onSaved: () => Promise<void>;
}) {
  const { lib, loading, refresh } = useLibrary(false);
  const { push, pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  const setting = modeSettings(lib, mode);
  if (loading) return <Form isLoading />;
  return (
    <Form
      isLoading={busy}
      navigationTitle={title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Mode Settings"
            onSubmit={async (values: {
              autoSpeak: boolean;
              scope: "default" | "selected";
            }) => {
              if (busy) return;
              setBusy(true);
              try {
                await store.mutate((lib) => {
                  lib.settings ??= {};
                  lib.settings.practice ??= {};
                  lib.settings.practice[mode] = {
                    ...modeSettings(lib, mode),
                    ...values,
                  };
                });
                await onSaved();
                void autoBackup();
                pop();
              } catch (error) {
                await report(error);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Action
            title="Select Words"
            onAction={() =>
              push(
                <ModeWords
                  mode={mode}
                  title={title}
                  onSaved={async () => {
                    await refresh();
                    await onSaved();
                  }}
                />,
              )
            }
          />
        </ActionPanel>
      }
    >
      <Form.Checkbox
        id="autoSpeak"
        title="Pronunciation"
        label="Automatically pronounce each question"
        defaultValue={setting.autoSpeak}
      />
      <Form.Dropdown
        id="scope"
        title="Default Word Selection"
        defaultValue={setting.scope}
      >
        <Form.Dropdown.Item value="default" title="Default Library" />
        <Form.Dropdown.Item value="selected" title="Selected Words Only" />
      </Form.Dropdown>
      <Form.Description
        title="Selected Words"
        text={`${setting.wordIds.length} words. Use Select Words in the Action Panel. This list is independent for each mode; archived and globally excluded words remain excluded. The practice menu can temporarily override the default selection.`}
      />
    </Form>
  );
}
function ModeWords({
  mode,
  title,
  onSaved,
}: {
  mode: Mode;
  title: string;
  onSaved: () => Promise<void>;
}) {
  const { lib, loading, refresh } = useLibrary(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = new Set(modeSettings(lib, mode).wordIds);
  const toggle = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await store.mutate((lib) => {
        lib.settings ??= {};
        lib.settings.practice ??= {};
        const setting = modeSettings(lib, mode);
        const ids = new Set(setting.wordIds);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        lib.settings.practice[mode] = { ...setting, wordIds: [...ids] };
      });
      await refresh();
      await onSaved();
      void autoBackup();
    } catch (error) {
      await report(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <List
      isLoading={loading || busy}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      navigationTitle={`${title} · ${selected.size} Selected`}
    >
      {lib.words
        .filter((word) => !word.archived && matchesSearch(word, query))
        .map((word) => (
          <List.Item
            key={word.id}
            title={word.word}
            icon={selected.has(word.id) ? Icon.CheckCircle : Icon.Circle}
            subtitle={word.practice ? undefined : "Globally excluded"}
            accessories={[{ text: selected.has(word.id) ? "Selected" : "" }]}
            actions={
              <ActionPanel>
                <Action
                  title={
                    selected.has(word.id)
                      ? "Remove from Selected Words"
                      : "Add to Selected Words"
                  }
                  onAction={() => toggle(word.id)}
                />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
