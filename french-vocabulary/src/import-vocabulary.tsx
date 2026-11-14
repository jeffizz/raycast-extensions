import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import {
  applyImport,
  detectColumns,
  Field,
  fields,
  importSummary,
  labels,
  Parsed,
} from "./core/importer";
import { uid } from "./core/model";
import { autoBackup, report, store, useLibrary } from "./runtime";
import { enrichWord } from "./lexicon";
import { wordMarkdown } from "./components/word";

export default function ImportVocabulary({
  onImported,
}: {
  onImported?: () => Promise<void>;
}) {
  const { push } = useNavigation(),
    [text, setText] = useState("");
  const next = (value: string) => {
    try {
      push(<Mapping parsed={detectColumns(value)} onImported={onImported} />);
    } catch (e) {
      void report(e);
    }
  };
  return (
    <Form
      navigationTitle="Import Vocabulary"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Detect Columns"
            icon={Icon.ArrowRight}
            onSubmit={() => next(text)}
          />
          <Action
            title="Paste from Clipboard"
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={async () => {
              const x = await Clipboard.readText();
              if (x) setText(x);
              else await report(Error("Clipboard has no text."));
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Excel / TSV / CSV"
        text="Paste your table, with or without a header. Column order can vary. You will confirm the mapping and duplicate preview before anything is saved."
      />
      <Form.TextArea
        id="table"
        title="Vocabulary Table"
        value={text}
        onChange={setText}
        placeholder="French word ⇥ POS ⇥ IPA ⇥ English ⇥ Chinese"
      />
      <Form.Description text="Case, accents, original IPA, and variant notations such as chinois(e) are preserved. New words are included in practice by default; remove any word from practice in Browse." />
    </Form>
  );
}
function Mapping({
  parsed,
  onImported,
}: {
  parsed: Parsed;
  onImported?: () => Promise<void>;
}) {
  const { push } = useNavigation();
  return (
    <Form
      navigationTitle="Confirm Column Mapping"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Preview Import"
            onSubmit={(v: Record<string, string>) => {
              const mapping = parsed.mapping.map(
                (_, i) => v[`col${i}`] as Field,
              );
              try {
                const used = mapping.filter((f) => f !== "ignore");
                if (
                  mapping.filter((f) => f === "word").length !== 1 ||
                  new Set(used).size !== used.length
                )
                  throw Error(
                    "Map one French Word column; each field may appear only once.",
                  );
                push(
                  <Preview
                    rows={parsed.rows}
                    mapping={mapping}
                    onImported={onImported}
                  />,
                );
              } catch (e) {
                void report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title={`${parsed.rows.length} rows · ${parsed.header ? "header detected" : "no header"}`}
        text={
          parsed.warnings.join("\n") || "Review the mapping before continuing."
        }
      />
      {parsed.mapping.map((f, i) => (
        <Form.Dropdown
          key={i}
          id={`col${i}`}
          title={`Column ${i + 1}`}
          defaultValue={f}
          info={parsed.rows
            .slice(0, 3)
            .map((r) => r[i] ?? "(empty)")
            .join(" · ")}
        >
          {fields.map((x) => (
            <Form.Dropdown.Item key={x} value={x} title={labels[x]} />
          ))}
        </Form.Dropdown>
      ))}
    </Form>
  );
}
function Preview({
  rows,
  mapping,
  onImported,
}: {
  rows: string[][];
  mapping: Field[];
  onImported?: () => Promise<void>;
}) {
  const { lib, loading } = useLibrary(),
    { pop } = useNavigation(),
    [busy, setBusy] = useState(false);
  const copy = structuredClone(lib);
  let error = "",
    summary = "";
  const batchId = "preview";
  try {
    summary = importSummary(applyImport(copy, rows, mapping, batchId));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const touched = new Set(rows.map((r) => r[mapping.indexOf("word")]?.trim()));
  const words = copy.words.filter((w) => touched.has(w.word));
  const commit = async () => {
    if (error || busy) return;
    setBusy(true);
    try {
      await store.backupLocal("before-import");
      const stats = await store.mutate(async (l) => {
        const batch = uid();
        const previous = new Map(
          l.words.map((w) => [w.id, JSON.stringify(w.senses)]),
        );
        const stats = applyImport(l, rows, mapping, batch);
        for (const w of l.words)
          if (
            !previous.has(w.id) ||
            previous.get(w.id) !== JSON.stringify(w.senses)
          )
            await enrichWord(w);
        return stats;
      });
      await showToast({
        style: Toast.Style.Success,
        title: "Vocabulary imported",
        message: importSummary(stats),
      });
      await onImported?.();
      await autoBackup();
      pop();
      pop();
    } catch (e) {
      await report(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <List
      isLoading={loading || busy}
      isShowingDetail
      navigationTitle="Import Preview"
      actions={
        <ActionPanel>
          <Action title="Confirm Import" icon={Icon.Check} onAction={commit} />
        </ActionPanel>
      }
    >
      <List.Item
        title={error ? "Fix the column mapping" : summary}
        icon={error ? Icon.ExclamationMark : Icon.Info}
        detail={
          <List.Item.Detail
            markdown={
              error
                ? `# Cannot import\n\n${error}`
                : `# Import Preview\n\n${summary}\n\n* Same spelling with different meanings is kept as separate senses.\n* Exact duplicates are skipped.\n* Capitalization and accents are significant for identity.\n* Ambiguous gender is never guessed.\n* A local backup is created before import.\n* LeXiK noun enrichment runs on confirmation.\n\n**No changes have been saved yet.**`
            }
          />
        }
        actions={
          <ActionPanel>
            {!error && (
              <Action
                title="Confirm Import"
                icon={Icon.Check}
                onAction={commit}
              />
            )}
          </ActionPanel>
        }
      />
      {!error &&
        words.map((w) => (
          <List.Item
            key={w.id}
            title={w.word}
            subtitle={`${w.senses.length} sense(s)`}
            detail={<List.Item.Detail markdown={wordMarkdown(w)} />}
            actions={
              <ActionPanel>
                <Action
                  title="Confirm Import"
                  icon={Icon.Check}
                  onAction={commit}
                />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
