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
                text: `Audio ${setting.autoSpeak ? "on" : "off"}`,
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
  const { lib, loading } = useLibrary(false);
  const { pop } = useNavigation();
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
            onSubmit={async (values: { autoSpeak: boolean }) => {
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
        </ActionPanel>
      }
    >
      <Form.Checkbox
        id="autoSpeak"
        title="Pronunciation"
        label="Automatically pronounce each question"
        defaultValue={setting.autoSpeak}
      />
    </Form>
  );
}
