import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  LocalStorage,
  useNavigation,
  showToast,
  Toast,
  confirmAlert,
} from "@raycast/api";
import { usePromise, useForm } from "@raycast/utils";
import { AIConfig, generate } from "./client";
import { providers, Provider } from "./core";
import { report } from "../runtime";
import { CodexSettings } from "./codex-settings";
import { ModelPicker } from "./model-picker";
import { useEffect, useRef, useState } from "react";
import { fetchModels, ModelOption, modelCacheKey } from "./models";
export function AISettings() {
  const { push, pop } = useNavigation();
  const { data, isLoading, revalidate } = usePromise(async () => ({
    connection:
      (await LocalStorage.getItem<string>("vocabulary-ai-connection-v1")) ??
      "api",
    active: JSON.parse(
      (await LocalStorage.getItem<string>("vocabulary-ai-config-v1")) ?? "null",
    ) as AIConfig | null,
    configs: JSON.parse(
      (await LocalStorage.getItem<string>("vocabulary-ai-providers-v1")) ??
        "{}",
    ) as Partial<Record<Provider, AIConfig>>,
  }));
  return (
    <List isLoading={isLoading} navigationTitle="AI Settings & Keys">
      <List.Section title="Subscription · CLI">
        <List.Item
          title="Codex CLI"
          icon={Icon.Terminal}
          accessories={data?.connection === "codex" ? [{ text: "Active" }] : []}
          subtitle={
            data?.connection === "codex"
              ? "ChatGPT subscription"
              : "Use local ChatGPT login"
          }
          actions={
            <ActionPanel>
              <Action
                title="Configure Codex CLI"
                onAction={() =>
                  push(
                    <CodexSettings
                      onSaved={async () => {
                        await revalidate();
                        pop();
                      }}
                    />,
                  )
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="API · Providers & Keys">
        <List.Item
          icon={Icon.Globe}
          title="API"
          subtitle={
            data?.connection === "api"
              ? "Active"
              : "API configuration is preserved"
          }
          actions={
            <ActionPanel>
              <Action
                title="Use API Connection"
                onAction={async () => {
                  await LocalStorage.setItem(
                    "vocabulary-ai-connection-v1",
                    "api",
                  );
                  await revalidate();
                }}
              />
            </ActionPanel>
          }
        />
        {Object.entries(providers).map(([id, name]) => (
          <List.Item
            key={id}
            title={name}
            icon={Icon.Key}
            subtitle={
              data?.connection === "api" && data?.active?.provider === id
                ? "Active"
                : ""
            }
            actions={
              <ActionPanel>
                <Action
                  title="Configure Provider"
                  onAction={() =>
                    push(
                      <SettingsForm
                        initial={
                          data?.configs[id as Provider] ??
                          (data?.active?.provider === id
                            ? data.active
                            : undefined)
                        }
                        provider={id as Provider}
                        onSaved={async () => {
                          await revalidate();
                          pop();
                        }}
                      />,
                    )
                  }
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
function SettingsForm({
  initial,
  provider,
  onSaved,
}: {
  initial?: AIConfig;
  provider: Provider;
  onSaved: () => Promise<void>;
}) {
  const { push } = useNavigation();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const modelRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void LocalStorage.getItem<string>(modelCacheKey(provider))
      .then((raw) => {
        if (active && raw) setModels(JSON.parse(raw));
      })
      .catch(report);
    return () => {
      active = false;
      modelRequest.current?.abort();
    };
  }, [provider]);
  const { itemProps, handleSubmit, values, setValue } = useForm<{
    model: string;
    key: string;
  }>({
    initialValues: { model: initial?.model ?? "", key: initial?.key ?? "" },
    validation: {
      key: (v) => (v?.trim() ? undefined : "Enter an API key."),
    },
    onSubmit: async (submitted) => {
      if (modelRequest.current) return;
      try {
        const config = {
          provider,
          connection: "api" as const,
          model: (values.model ?? "").trim(),
          key: (submitted.key ?? values.key ?? "").trim(),
        };
        const configs = JSON.parse(
          (await LocalStorage.getItem<string>("vocabulary-ai-providers-v1")) ??
            "{}",
        );
        const active = JSON.parse(
          (await LocalStorage.getItem<string>("vocabulary-ai-config-v1")) ??
            "null",
        );
        if (active) configs[active.provider] = active;
        configs[provider] = config;
        await LocalStorage.setItem(
          "vocabulary-ai-providers-v1",
          JSON.stringify(configs),
        );
        if (config.model)
          await LocalStorage.setItem("vocabulary-ai-connection-v1", "api");
        if (config.model)
          await LocalStorage.setItem(
            "vocabulary-ai-config-v1",
            JSON.stringify(config),
          );
        if (!config.model) {
          setModelsLoading(true);
          const controller = new AbortController();
          modelRequest.current = controller;
          try {
            const fetched = await fetchModels(
              provider,
              config.key,
              controller.signal,
            );
            setModels(fetched);
            chooseModel(fetched);
          } catch (error) {
            await report(error);
          } finally {
            modelRequest.current = undefined;
            setModelsLoading(false);
          }
          return;
        }
        await showToast({
          style: Toast.Style.Success,
          title: "AI Provider Activated",
        });
        await onSaved();
      } catch (e) {
        await report(e);
      }
    },
  });
  const chooseModel = (options = models) =>
    push(
      <ModelPicker
        models={options}
        provider={provider}
        onChoose={(id) => setValue("model", id)}
      />,
    );
  return (
    <Form
      navigationTitle={providers[provider]}
      isLoading={modelsLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={
              values.model.trim()
                ? "Save and Activate Provider"
                : "Save Key and Fetch Models"
            }
            onSubmit={handleSubmit}
          />
          <Action
            title="Refresh Models"
            onAction={async () => {
              if (modelRequest.current) return;
              const controller = new AbortController();
              modelRequest.current = controller;
              setModelsLoading(true);
              try {
                const fetched = await fetchModels(
                  provider,
                  values.key,
                  controller.signal,
                );
                setModels(fetched);
                chooseModel(fetched);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Model List Updated",
                });
              } catch (error) {
                if (!controller.signal.aborted) await report(error);
              } finally {
                modelRequest.current = undefined;
                setModelsLoading(false);
              }
            }}
          />
          <Action title="Choose Model" onAction={() => chooseModel()} />
          <Action
            title="Test Saved Connection (Uses API Credits)"
            onAction={async () => {
              if (!initial) {
                await report(
                  Error("Save this provider first, then reopen its settings."),
                );
                return;
              }
              if (
                !(await confirmAlert({
                  title: "Test saved AI configuration?",
                  message:
                    "Send the word bonjour to " +
                    providers[provider] +
                    ". A small API charge may apply.",
                }))
              )
                return;
              try {
                await generate(
                  initial,
                  "senses",
                  JSON.stringify({ word: "bonjour" }),
                  AbortSignal.timeout(60000),
                  true,
                );
                await showToast({
                  style: Toast.Style.Success,
                  title: "Connection and JSON Output Verified",
                });
              } catch (e) {
                await report(e);
              }
            }}
          />
          <Action
            title="Delete Provider Key"
            onAction={async () => {
              try {
                const configs = JSON.parse(
                  (await LocalStorage.getItem<string>(
                    "vocabulary-ai-providers-v1",
                  )) ?? "{}",
                );
                delete configs[provider];
                await LocalStorage.setItem(
                  "vocabulary-ai-providers-v1",
                  JSON.stringify(configs),
                );
                const active = JSON.parse(
                  (await LocalStorage.getItem<string>(
                    "vocabulary-ai-config-v1",
                  )) ?? "null",
                );
                if (active?.provider === provider)
                  await LocalStorage.removeItem("vocabulary-ai-config-v1");
                await onSaved();
              } catch (e) {
                await report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="One key and model per provider. Saving activates this provider without deleting other provider keys. Keys remain in Raycast encrypted LocalStorage, outside library backups. Saving a key without a model fetches the model catalog; selecting a model never activates it until saved. OpenRouter may send content to downstream providers." />
      <Form.Description text="Save the key to fetch the catalog, then choose a model. Refresh Models only retrieves the catalog; suggestions and compatibility labels use local rules, without AI analysis or generation tokens. Choose Model opens the cached catalog. Suggestions are not compatibility tests. Model choice never changes automatically." />
      <Form.PasswordField title="API Key" {...itemProps.key} />
      <Form.Description
        title="Learning Model"
        text={
          values.model || "Not selected — save the key to fetch the catalog."
        }
      />
      <Form.Description text="Choose a model supporting JSON output. Calls are explicit and may incur charges. No automatic fallback. Stories default to a short unverified summary without search. Optional Search for Sources requires OpenAI web search. Codex CLI can be activated separately; API settings remain available for explicit fallback." />
    </Form>
  );
}
