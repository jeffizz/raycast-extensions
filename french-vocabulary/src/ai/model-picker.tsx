import { Action, ActionPanel, List, useNavigation } from "@raycast/api";
import { Provider } from "./core";
import { ModelOption, modelAssessment } from "./model-catalog";

const pricingPages: Record<Provider, string> = {
  openai: "https://developers.openai.com/api/docs/pricing",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing/",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing/",
  openrouter: "https://openrouter.ai/models",
};
export function ModelPicker({
  models,
  provider,
  onChoose,
}: {
  models: ModelOption[];
  provider: Provider;
  onChoose: (id: string) => void;
}) {
  const { pop } = useNavigation();
  const pricing = (
    <Action.OpenInBrowser
      title="Open Official Pricing"
      url={pricingPages[provider]}
    />
  );
  return (
    <List
      navigationTitle="Choose Learning Model"
      searchBarPlaceholder="Search catalog models…"
      actions={<ActionPanel>{pricing}</ActionPanel>}
    >
      <List.EmptyView
        title="No Models Available"
        description="Return to settings and refresh the catalog."
      />
      <List.Section title="Local rules only · Suggestions are not compatibility tests">
        {[...models]
          .sort(
            (a, b) =>
              modelAssessment(a).rank - modelAssessment(b).rank ||
              a.id.localeCompare(b.id),
          )
          .map((model) => {
            const assessment = modelAssessment(model);
            return (
              <List.Item
                key={model.id}
                title={model.id}
                subtitle={assessment.reason}
                accessories={[
                  {
                    text: assessment.blocked
                      ? "Incompatible"
                      : assessment.recommended
                        ? "Suggested"
                        : "Unknown",
                  },
                ]}
                actions={
                  <ActionPanel>
                    {!assessment.blocked && (
                      <Action
                        title="Use Model"
                        onAction={() => {
                          onChoose(model.id);
                          pop();
                        }}
                      />
                    )}
                    {pricing}
                  </ActionPanel>
                }
              />
            );
          })}
      </List.Section>
    </List>
  );
}
