import { List } from "@raycast/api";
import { useEffect, useState, type ReactElement } from "react";
import { verbFromContext } from "./launch";
import { PickVerb } from "./pick-verb";

export function OpenVerb({
  fallbackText,
  render,
}: {
  fallbackText?: string | null;
  render: (ctx: { infinitive: string; pick: (infinitive: string) => void }) => ReactElement;
}) {
  const [launch, setLaunch] = useState<{ query: string; infinitive: string | null } | null>(null);
  const [override, setOverride] = useState<string | null>(null);

  useEffect(() => {
    void verbFromContext(fallbackText).then(setLaunch);
  }, [fallbackText]);

  if (!launch) return <List isLoading searchBarPlaceholder="正在读取选中的词" />;

  const infinitive = override === null ? launch.infinitive : override || null;
  if (!infinitive) {
    return <PickVerb initialQuery={override === null ? launch.query : ""} onPick={setOverride} />;
  }
  return render({ infinitive, pick: setOverride });
}
