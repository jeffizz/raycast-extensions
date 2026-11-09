import React, { useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { getStrategy, setStrategy, STRATEGIES, STRATEGY_LABELS, type SpeechStrategy } from "./strategy";

export default function Command() {
  const [current, setCurrent] = useState<SpeechStrategy>();
  useEffect(() => { getStrategy().then(setCurrent).catch(report); }, []);
  async function report(error: unknown) {
    await showToast({ style: Toast.Style.Failure, title: "Cannot update strategy", message: error instanceof Error ? error.message : "Unknown error" });
  }
  return <List isLoading={!current}>
    {STRATEGIES.map((strategy) => <List.Item key={strategy} title={STRATEGY_LABELS[strategy]} icon={strategy === current ? Icon.Checkmark : Icon.Circle}
      accessories={strategy === current ? [{ text: "Current" }] : []}
      actions={<ActionPanel><Action title="Use This Strategy" onAction={async () => {
        try { await setStrategy(strategy); setCurrent(strategy); } catch (error) { await report(error); }
      }} /></ActionPanel>} />)}
  </List>;
}
