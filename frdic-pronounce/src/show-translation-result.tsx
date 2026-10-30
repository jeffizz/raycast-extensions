import { Action, ActionPanel, Detail, LaunchProps } from "@raycast/api";
import React from "react";
import type { SourceLanguage } from "./translate/types";

type CommandLaunchContext = {
  translatedText?: string;
  sourceLanguage?: SourceLanguage;
};

function getSourceLabel(sourceLanguage?: SourceLanguage): string {
  if (sourceLanguage === "en") {
    return "English";
  }
  return "French";
}

export default function Command(props: LaunchProps<{ launchContext: CommandLaunchContext }>) {
  const translatedText = props.launchContext?.translatedText?.trim() ?? "";
  const sourceLabel = getSourceLabel(props.launchContext?.sourceLanguage);
  const markdown = translatedText || "No translation result";

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Translated from" text={sourceLabel} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Rich Text" content={translatedText || markdown} />
        </ActionPanel>
      }
    />
  );
}
