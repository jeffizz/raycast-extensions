import {
  Action,
  ActionPanel,
  Form,
  LocalStorage,
  showToast,
  Toast,
} from "@raycast/api";
import { useForm, usePromise } from "@raycast/utils";
import { resolveCodex, checkCodex } from "./codex-cli";
import { report } from "../runtime";
import { tmpdir } from "node:os";
export function CodexSettings({ onSaved }: { onSaved: () => Promise<void> }) {
  const { data, isLoading } = usePromise(async () => ({
    path:
      (await LocalStorage.getItem<string>("vocabulary-codex-path-v1")) ?? "",
    model:
      (await LocalStorage.getItem<string>("vocabulary-codex-model-v1")) ?? "",
  }));
  if (isLoading) return <Form isLoading />;
  return (
    <Settings initial={data ?? { path: "", model: "" }} onSaved={onSaved} />
  );
}
function Settings({
  initial,
  onSaved,
}: {
  initial: { path: string; model: string };
  onSaved: () => Promise<void>;
}) {
  const { itemProps, handleSubmit, values } = useForm<{
    path: string;
    model: string;
  }>({
    initialValues: initial,
    onSubmit: async (submitted) => {
      try {
        const executable = await resolveCodex(submitted.path?.trim());
        await checkCodex(executable, tmpdir(), AbortSignal.timeout(15000));
        await LocalStorage.setItem("vocabulary-codex-path-v1", executable);
        await LocalStorage.setItem(
          "vocabulary-codex-model-v1",
          submitted.model?.trim() ?? "",
        );
        await LocalStorage.setItem("vocabulary-ai-connection-v1", "codex");
        await showToast({
          style: Toast.Style.Success,
          title: "Codex CLI Activated",
        });
        await onSaved();
      } catch (error) {
        await report(error);
      }
    },
  });
  return (
    <Form
      navigationTitle="Codex CLI"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Check and Activate Codex CLI"
            onSubmit={handleSubmit}
          />
          <Action
            title="Check Installation and Login"
            onAction={async () => {
              try {
                await checkCodex(
                  await resolveCodex(values.path?.trim()),
                  tmpdir(),
                  AbortSignal.timeout(15000),
                );
                await showToast({
                  style: Toast.Style.Success,
                  title: "Codex Found · ChatGPT Login",
                });
              } catch (error) {
                await report(error);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Install Codex and sign in with ChatGPT in Terminal. This extension never reads or copies credentials. Activation checks help and login status only; it does not generate content or spend model quota." />
      <Form.TextField
        title="Executable Path"
        placeholder="Auto-detect Codex"
        {...itemProps.path}
      />
      <Form.TextField
        title="Model (Optional)"
        placeholder="CLI Default"
        {...itemProps.model}
      />
      <Form.Description text="Leave Model empty to use the CLI built-in default. Enter an exact Codex model ID to override it. Unavailable models fail without automatic fallback." />
      <Form.Description text="Each generation starts a fresh ephemeral task in a temporary directory with restricted filesystem permissions and disabled tools. Uses the selected model or CLI built-in default, ignoring user configuration. Timeout: 120 seconds. API keys are not passed to the process. No automatic API fallback. CLI usage is tracked separately and is not a subscription balance." />
    </Form>
  );
}
