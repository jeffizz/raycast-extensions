import { List, Toast, showToast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { book } from "./data";
import { findVerbMatches, type MatchedCell, type VerbMatch } from "./lexik";
import { verbFromContext } from "./launch";
import { recordLookup } from "./mine";
import { PickVerb } from "./pick-verb";

export type { MatchedCell } from "./lexik";

type Selection = { infinitive: string; matchedCells: MatchedCell[] };
type Launch = { query: string; selection: Selection | null; candidates: VerbMatch[] };

export function OpenVerb({
  fallbackText,
  resolveInflected = false,
  render,
}: {
  fallbackText?: string | null;
  resolveInflected?: boolean;
  render: (ctx: { infinitive: string; matchedCells: MatchedCell[]; pick: (infinitive: string) => void }) => ReactElement;
}) {
  const { push, pop } = useNavigation();
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [revision, setRevision] = useState(0);
  const pushedInitial = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const context = await verbFromContext(fallbackText);
      if (!active) return;
      if (context.infinitive) {
        setLaunch({ query: "", selection: { infinitive: context.infinitive, matchedCells: [] }, candidates: [] });
        return;
      }
      if (resolveInflected && context.query) {
        try {
          const candidates = await findVerbMatches(book, context.query);
          if (!active) return;
          if (candidates.length === 1) {
            setLaunch({ query: "", selection: candidates[0], candidates: [] });
            return;
          }
          if (candidates.length > 1) {
            setLaunch({ query: context.query, selection: null, candidates });
            return;
          }
        } catch (error) {
          console.error("LeXiK lookup failed", error);
          void showToast({ style: Toast.Style.Failure, title: "动词词形库查询失败", message: "请检查 SQLite 词库是否存在" });
        }
      }
      // Unknown selected text or clipboard contents should not hide the initial list.
      if (active) setLaunch({ query: "", selection: null, candidates: [] });
    }
    void load();
    return () => { active = false; };
  }, [fallbackText, resolveInflected]);

  function open(selection: Selection) {
    if (resolveInflected) {
      void recordLookup(selection.infinitive).catch((error) => {
        console.error("Failed to save lookup history", error);
        void showToast({ style: Toast.Style.Failure, title: "查询次数保存失败" });
      });
    }
    const pick = (infinitive: string) => {
      pop();
      if (infinitive) open({ infinitive, matchedCells: [] });
    };
    // Raycast bundles a different patch version of React's type definitions.
    const view = render({ ...selection, pick }) as unknown as Parameters<typeof push>[0];
    push(view, () => setRevision((value) => value + 1));
  }

  useEffect(() => {
    if (!launch?.selection || pushedInitial.current) return;
    pushedInitial.current = true;
    open(launch.selection);
  }, [launch]);

  if (!launch) return <List isLoading searchBarPlaceholder="正在读取选中的词" />;
  return (
    <PickVerb
      key={revision}
      initialQuery={revision === 0 ? launch.query : ""}
      initialMatches={revision === 0 ? launch.candidates : []}
      resolveInflected={resolveInflected}
      onPick={(infinitive, matchedCells = []) => open({ infinitive, matchedCells })}
    />
  );
}
