import { Action, ActionPanel, Detail } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { readUsage } from "./usage";
import { usageMarkdown } from "./usage-markdown";

export function AIUsage() {
  const { data, isLoading, revalidate } = usePromise(readUsage);
  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="AI Token Usage"
      markdown={usageMarkdown(data ?? {})}
      actions={
        <ActionPanel>
          <Action title="Refresh" onAction={revalidate} />
        </ActionPanel>
      }
    />
  );
}
