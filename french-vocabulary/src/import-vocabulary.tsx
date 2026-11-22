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
import { useEffect, useMemo, useRef, useState } from "react";
import { CollectionPicker } from "./components/collections";
import { addImportedWordsToCollection, collections } from "./core/collections";
import { createHash } from "node:crypto";
import {
  applyImport,
  combineImportText,
  ImportConflict,
  ImportDecision,
  detectColumns,
  Field,
  fields,
  importSummary,
  labels,
  Parsed,
} from "./core/importer";
import { canonical, uid } from "./core/model";
import { autoBackup, report, store, useLibrary } from "./runtime";
import { enrichWord } from "./lexicon";
import { wordMarkdown } from "./components/word";
import { importConflictMarkdown } from "./core/presentation";

type ImportDraft = {
  collectionId?: string;
  libraryId: string;
  inputHash: string;
  rows: string[][];
  mapping: Field[];
  decisions: Record<string, ImportDecision>;
};
const draftKey = "import-review-draft";
export default function ImportVocabulary({
  onImported,
}: {
  onImported?: () => Promise<void>;
}) {
  const { push } = useNavigation(),
    [text, setText] = useState("");
  const [draft, setDraft] = useState<ImportDraft | null>();
  useEffect(() => {
    void store
      .getMeta<ImportDraft | null>(draftKey)
      .then(setDraft)
      .catch(report);
  }, []);
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
          {draft && (
            <Action
              title="Resume Import Review"
              onAction={() =>
                push(
                  <Preview
                    rows={draft.rows}
                    mapping={draft.mapping}
                    onImported={onImported}
                  />,
                )
              }
            />
          )}
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
  const [collectionId, setCollectionId] = useState("");
  const { lib, loading, refresh } = useLibrary(false),
    { pop, push } = useNavigation(),
    [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>(
    {},
  );
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(0);
  const decisionLock = useRef(false);
  const inputHash = useMemo(
    () =>
      createHash("sha256")
        .update(JSON.stringify([rows, mapping]))
        .digest("hex"),
    [rows, mapping],
  );
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setReady(false);
    void (async () => {
      const saved = await store.getMeta<ImportDraft | null>(draftKey);
      const restored =
        saved?.libraryId === lib.libraryId && saved.inputHash === inputHash
          ? saved.decisions
          : {};
      await store.setMeta(draftKey, {
        libraryId: lib.libraryId,
        inputHash,
        rows,
        mapping,
        decisions: restored,
        collectionId:
          saved?.libraryId === lib.libraryId && saved.inputHash === inputHash
            ? saved.collectionId
            : undefined,
      });
      if (!cancelled) {
        setCollectionId(
          saved?.libraryId === lib.libraryId && saved.inputHash === inputHash
            ? (saved.collectionId ?? "")
            : "",
        );
        setDecisions(restored);
        setReady(true);
      }
    })().catch(report);
    return () => {
      cancelled = true;
    };
  }, [loading, lib.libraryId, inputHash]);
  const { conflicts, words, error, summary } = useMemo(() => {
    if (loading || !ready)
      return {
        conflicts: [] as ImportConflict[],
        words: [],
        error: "",
        summary: "",
      };
    // Review does not need scheduling cards or history, and only clones touched words.
    const touched = new Set(
      rows.map((r) => canonical(r[mapping.indexOf("word")] ?? "")),
    );
    const copy = {
      ...lib,
      cards: [],
      reviews: [],
      groups: [],
      words: structuredClone(lib.words.filter((w) => touched.has(w.word))),
    };
    const conflicts: ImportConflict[] = [];
    try {
      const stats = applyImport(copy, rows, mapping, "preview", (c) => {
        conflicts.push(structuredClone(c));
        return decisions[c.key] ?? { action: "keep" };
      });
      return {
        conflicts,
        words: copy.words,
        error: "",
        summary: importSummary(stats),
      };
    } catch (e) {
      return {
        conflicts,
        words: copy.words,
        error: e instanceof Error ? e.message : String(e),
        summary: "",
      };
    }
  }, [lib, rows, mapping, decisions, loading, ready]);
  const unresolved = conflicts.filter((c) => !decisions[c.key]);
  const allIds = [
    ...conflicts.map((c) => "conflict-" + c.row),
    "summary",
    "load-more",
    ...words.map((w) => w.id),
  ];
  const active =
    selected && allIds.includes(selected)
      ? selected
      : unresolved[0]
        ? "conflict-" + unresolved[0].row
        : "summary";
  const pageSize = 50;
  useEffect(() => {
    const index = conflicts.findIndex((c) => "conflict-" + c.row === active);
    if (index >= 0) setPage(Math.floor(index / pageSize));
  }, [active, conflicts]);
  const visibleConflicts = conflicts.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );
  const [wordCount, setWordCount] = useState(50);
  const choose = async (conflict: ImportConflict, decision: ImportDecision) => {
    if (decisionLock.current || busy || !ready) return false;
    decisionLock.current = true;
    try {
      const next = { ...decisions, [conflict.key]: decision };
      await store.setMeta(draftKey, {
        libraryId: lib.libraryId,
        inputHash,
        rows,
        mapping,
        decisions: next,
        collectionId,
      });
      setDecisions(next);
      const remaining = conflicts.filter((c) => !next[c.key]);
      const following =
        remaining.find((c) => c.row > conflict.row) ?? remaining[0];
      setSelected(following ? "conflict-" + following.row : "summary");
      if (following)
        setPage(Math.floor(conflicts.indexOf(following) / pageSize));
      return true;
    } catch (e) {
      await report(e);
      return false;
    } finally {
      decisionLock.current = false;
    }
  };
  const chooseCollection = async (id: string) => {
    if (busy || !ready || decisionLock.current)
      throw Error("Wait for the current import change to finish.");
    decisionLock.current = true;
    setBusy(true);
    try {
      await store.setMeta(draftKey, {
        libraryId: lib.libraryId,
        inputHash,
        rows,
        mapping,
        decisions,
        collectionId: id,
      });
      await refresh();
      setCollectionId(id);
    } finally {
      decisionLock.current = false;
      setBusy(false);
    }
  };
  const commit = async () => {
    if (error || busy || !ready || decisionLock.current) return;
    if (conflicts.some((c) => !decisions[c.key])) {
      await report(
        Error("Review every ambiguous row before confirming import."),
      );
      return;
    }
    setBusy(true);
    try {
      await store.backupLocal("before-import");
      const stats = await store.mutate(async (l) => {
        const batch = uid();
        const previous = new Map(
          l.words.map((w) => [w.id, JSON.stringify(w.senses)]),
        );
        const stats = applyImport(l, rows, mapping, batch, (conflict) => {
          const decision = decisions[conflict.key];
          if (!decision)
            throw Error(
              "Import conflicts changed. Reopen the preview and review them before importing.",
            );
          return decision;
        });
        if (collectionId)
          addImportedWordsToCollection(
            l,
            collectionId,
            rows.map((row) => row[mapping.indexOf("word")] ?? ""),
          );
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
      await store.setMeta(draftKey, null);
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
      isLoading={loading || busy || !ready}
      selectedItemId={active}
      onSelectionChange={(id) => setSelected(id ?? undefined)}
      isShowingDetail
      navigationTitle="Import Preview"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Import Collection"
          value={collectionId}
          onChange={(value) => {
            if (
              value === collectionId ||
              busy ||
              !ready ||
              decisionLock.current
            )
              return;
            if (value === "__choose__") {
              push(
                <CollectionPicker
                  selected={collectionId}
                  onSelect={chooseCollection}
                />,
              );
            } else {
              void chooseCollection(value).catch(report);
            }
          }}
        >
          <List.Dropdown.Item value="" title="No Collection" />
          {collections(lib).map((c) => (
            <List.Dropdown.Item key={c.id} value={c.id} title={c.name} />
          ))}
          <List.Dropdown.Item
            value="__choose__"
            title="Choose or Create Collection…"
          />
        </List.Dropdown>
      }
      actions={
        <ActionPanel>
          <Action title="Confirm Import" icon={Icon.Check} onAction={commit} />
        </ActionPanel>
      }
    >
      {!error &&
        visibleConflicts.map((conflict) => (
          <List.Item
            key={"conflict-" + conflict.row}
            id={"conflict-" + conflict.row}
            title={`Row ${conflict.row}: ${conflict.word}`}
            subtitle={
              decisions[conflict.key]
                ? {
                    keep: "Keep Existing",
                    update: "Update Existing",
                    add: "Add as New Sense",
                    merge: "Merge Fields",
                  }[decisions[conflict.key].action]
                : "Review Required"
            }
            icon={
              decisions[conflict.key] ? Icon.CheckCircle : Icon.ExclamationMark
            }
            detail={
              active === "conflict-" + conflict.row ? (
                <List.Item.Detail
                  markdown={importConflictMarkdown(
                    conflict.word,
                    conflict.incoming,
                    conflict.candidates,
                  )}
                />
              ) : undefined
            }
            actions={
              active === "conflict-" + conflict.row ? (
                <ActionPanel>
                  <Action
                    title="Keep Existing"
                    shortcut={{ modifiers: ["cmd"], key: "1" }}
                    onAction={() => choose(conflict, { action: "keep" })}
                  />
                  <Action
                    title="Update Existing"
                    shortcut={{ modifiers: ["cmd"], key: "2" }}
                    onAction={() => {
                      if (conflict.candidates.length === 1)
                        return choose(conflict, {
                          action: "update",
                          target: 0,
                        });
                      push(
                        <UpdateTarget
                          conflict={conflict}
                          onSave={(decision) => choose(conflict, decision)}
                        />,
                      );
                    }}
                  />
                  <Action
                    title="Add as New Sense"
                    shortcut={{ modifiers: ["cmd"], key: "3" }}
                    onAction={() => choose(conflict, { action: "add" })}
                  />
                  <Action
                    title="Merge Fields"
                    shortcut={{ modifiers: ["cmd"], key: "4" }}
                    onAction={() =>
                      push(
                        <MergeFields
                          conflict={conflict}
                          target={0}
                          onSave={(decision) => choose(conflict, decision)}
                        />,
                      )
                    }
                  />
                  {page > 0 && (
                    <Action
                      title="Previous Conflict Page"
                      onAction={() => {
                        setPage((p) => p - 1);
                        setSelected(
                          "conflict-" + conflicts[(page - 1) * pageSize].row,
                        );
                      }}
                    />
                  )}
                  {(page + 1) * pageSize < conflicts.length && (
                    <Action
                      title="Next Conflict Page"
                      onAction={() => {
                        setPage((p) => p + 1);
                        setSelected(
                          "conflict-" + conflicts[(page + 1) * pageSize].row,
                        );
                      }}
                    />
                  )}
                </ActionPanel>
              ) : undefined
            }
          />
        ))}
      <List.Item
        id="summary"
        title={
          error
            ? "Fix the column mapping"
            : `${conflicts.filter((c) => !decisions[c.key]).length} unresolved · ${summary}`
        }
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
        words.slice(Math.max(0, wordCount - 50), wordCount).map((w) => (
          <List.Item
            key={w.id}
            id={w.id}
            title={w.word}
            subtitle={`${w.senses.length} sense(s)`}
            detail={
              active === w.id ? (
                <List.Item.Detail markdown={wordMarkdown(w)} />
              ) : undefined
            }
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
      {!error && words.length > wordCount && (
        <List.Item
          id="load-more"
          title="Show More Preview Words"
          actions={
            <ActionPanel>
              <Action
                title="Show More"
                onAction={() => setWordCount((c) => c + 50)}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
function MergeFields({
  conflict,
  target,
  onSave,
}: {
  conflict: ImportConflict;
  target: number;
  onSave: (decision: ImportDecision) => Promise<boolean>;
}) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(target);
  const [sources, setSources] = useState<NonNullable<ImportDecision["fields"]>>(
    {},
  );
  const existing = conflict.candidates[selectedTarget];
  return (
    <Form
      isLoading={busy}
      navigationTitle="Merge Fields"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply Merge"
            onSubmit={async () => {
              if (busy) return;
              setBusy(true);
              try {
                const saved = await onSave({
                  action: "merge",
                  target: selectedTarget,
                  fields: sources,
                });
                if (saved) pop();
              } finally {
                setBusy(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      {conflict.candidates.length > 1 && (
        <Form.Dropdown
          id="target"
          title="Existing Sense"
          value={String(selectedTarget)}
          onChange={(v) => {
            setSelectedTarget(Number(v));
            setSources({});
          }}
        >
          {conflict.candidates.map((s, i) => (
            <Form.Dropdown.Item
              key={i}
              value={String(i)}
              title={`Sense ${i + 1}: ${s.zh || s.en || s.pos}`}
            />
          ))}
        </Form.Dropdown>
      )}
      <Form.Description text="Choose a source per field. Chinese and English can also combine both values in either order, separated by a newline. Empty or identical values are not repeated. The existing sense ID and review records are preserved." />
      {(["pos", "ipa", "zh", "en"] as const).map((k) => (
        <Form.Dropdown
          key={k}
          id={k}
          title={labels[k]}
          value={sources[k] ?? "existing"}
          onChange={(v) =>
            setSources((s) => ({
              ...s,
              [k]: v as NonNullable<ImportDecision["fields"]>[typeof k],
            }))
          }
        >
          <Form.Dropdown.Item
            value="existing"
            title={`Existing: ${existing[k] || "(empty)"}`}
          />
          <Form.Dropdown.Item
            value="incoming"
            title={`Incoming: ${conflict.incoming[k] || "(empty)"}`}
          />
          {(k === "zh" || k === "en") && (
            <>
              <Form.Dropdown.Item
                value="existing-first"
                title="Combine Both: Existing First"
              />
              <Form.Dropdown.Item
                value="incoming-first"
                title="Combine Both: Incoming First"
              />
            </>
          )}
        </Form.Dropdown>
      ))}
      {(["zh", "en"] as const).map((k) => (
        <Form.Description
          key={"result-" + k}
          title={labels[k] + " Result"}
          text={
            sources[k] === "incoming"
              ? conflict.incoming[k] || "(empty)"
              : sources[k] === "existing-first"
                ? combineImportText(existing[k], conflict.incoming[k]) ||
                  "(empty)"
                : sources[k] === "incoming-first"
                  ? combineImportText(conflict.incoming[k], existing[k]) ||
                    "(empty)"
                  : existing[k] || "(empty)"
          }
        />
      ))}
    </Form>
  );
}
function UpdateTarget({
  conflict,
  onSave,
}: {
  conflict: ImportConflict;
  onSave: (decision: ImportDecision) => Promise<boolean>;
}) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Form
      isLoading={busy}
      navigationTitle="Update Existing Sense"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Update Selected Sense"
            onSubmit={async (v: { target: string }) => {
              if (busy) return;
              setBusy(true);
              try {
                if (
                  await onSave({ action: "update", target: Number(v.target) })
                )
                  pop();
              } finally {
                setBusy(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="target" title="Existing Sense" defaultValue="0">
        {conflict.candidates.map((s, i) => (
          <Form.Dropdown.Item
            key={i}
            value={String(i)}
            title={`Sense ${i + 1}: ${s.zh || s.en || s.pos}`}
          />
        ))}
      </Form.Dropdown>
      <Form.Description text="Choose the existing sense to update. Other senses and review records are preserved." />
    </Form>
  );
}
