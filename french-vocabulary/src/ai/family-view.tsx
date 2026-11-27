import {
  Action,
  ActionPanel,
  Detail,
  Color,
  Icon,
  List,
  confirmAlert,
  useNavigation,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { autoBackup, report, store } from "../runtime";
import { Library, Word } from "../core/model";
import { md } from "../core/presentation";
import {
  AIConfig,
  AIResult,
  generate,
  getAPIConfig,
  getConfig,
} from "./client";
import {
  familyMatchBatch,
  familyMatchKey,
  compatibleFamilySenses,
  familyRelations,
  FamilySelection,
  saveFamily,
} from "./family";

const wordPreview = (word: Word) =>
  "# " +
  md(word.word) +
  "\n\n" +
  word.senses
    .map(
      (s) =>
        "(" +
        md(s.pos) +
        ") /" +
        md(s.ipa) +
        "/\n\n" +
        md(s.zh) +
        "\n\n" +
        md(s.en),
    )
    .join("\n\n---\n\n");
export function WordFamily({
  word,
  selectedSenseId,
  onSaved,
  switchActions,
}: {
  switchActions?: (senseId?: string) => React.ReactElement;
  word: Word;
  selectedSenseId?: string;
  onSaved?: () => Promise<void>;
}) {
  const { data, isLoading } = usePromise(() => store.load(false));
  const [senseId, setSenseId] = useState(
    selectedSenseId ?? word.senses[0]?.id ?? "",
  );
  const switchPanel = switchActions && (
    <ActionPanel>{switchActions(senseId || undefined)}</ActionPanel>
  );
  if (!data)
    return (
      <List isLoading={isLoading} actions={switchPanel}>
        <List.EmptyView title="Loading Word Family" actions={switchPanel} />
      </List>
    );
  const current = data.words.find((w) => w.id === word.id);
  if (!current)
    return (
      <List actions={switchPanel}>
        <List.EmptyView title="Word No Longer Exists" actions={switchPanel} />
      </List>
    );
  const sense =
    current.senses.find((s) => s.id === senseId) ?? current.senses[0];
  return (
    <FamilyPage
      key={sense.id}
      initial={data}
      word={current}
      senseId={sense.id}
      setSenseId={setSenseId}
      onSaved={onSaved}
      switchAction={switchActions?.(sense.id)}
    />
  );
}
function FamilyPage({
  initial,
  word,
  senseId,
  setSenseId,
  onSaved,
  switchAction,
}: {
  switchAction?: React.ReactElement;
  initial: Library;
  word: Word;
  senseId: string;
  setSenseId: (id: string) => void;
  onSaved?: () => Promise<void>;
}) {
  const { push } = useNavigation();
  const [lib, setLib] = useState(initial);
  const [result, setResult] = useState<AIResult>();
  const [config, setConfig] = useState<AIConfig>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [selected, setSelected] = useState<Record<number, FamilySelection>>({});
  const controller = useRef<AbortController | undefined>(undefined);
  const lock = useRef(false);
  const links = useMemo(
    () => familyRelations(lib, word.id, senseId),
    [lib, word.id, senseId],
  );
  const matchBatch = useMemo(
    () =>
      familyMatchBatch(lib, result?.items.map((c) => c.headword ?? "") ?? []),
    [lib, result],
  );
  const isLinked = (c: AIResult["items"][number]) =>
    (matchBatch.get(familyMatchKey(c.headword ?? "")) ?? []).some((w) =>
      compatibleFamilySenses(w, c.pos ?? "").some((s) =>
        links.some((link) => link.word.id === w.id && link.senseId === s.id),
      ),
    );
  const input = JSON.stringify({
    word: word.word,
    senses: word.senses
      .filter((s) => s.id === senseId)
      .map((s) => ({ pos: s.pos, zh: s.zh, en: s.en })),
  });
  const run = async (force = false, override?: AIConfig) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(undefined);
    const request = new AbortController();
    controller.current = request;
    try {
      const connection = override ?? (await getConfig());
      setConfig(connection);
      const next = await generate(
        connection,
        "family",
        input,
        request.signal,
        force,
      );
      const latest = await store.load(false);
      if (request.signal.aborted) return;
      setLib(latest);
      setResult(next);
      setSelected({});
    } catch (error) {
      if (!request.signal.aborted) {
        setFailure(
          error instanceof Error ? error.message : "Generation failed.",
        );
        await report(error);
      }
    } finally {
      if (!request.signal.aborted) setBusy(false);
      lock.current = false;
    }
  };
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void run();
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  const save = async () => {
    if (lock.current) return;
    const choices = Object.values(selected);
    if (!choices.length || !config || !result) return;
    const existingCount = choices.filter((choice) => choice.existingId).length;
    lock.current = true;
    setBusy(true);
    try {
      if (
        !(await confirmAlert({
          title: "Save word family?",
          message: `Link existing: ${existingCount}. Create and link: ${choices.length - existingCount}.\nExisting words and senses are never modified.`,
        }))
      )
        return;
      await store.mutateContent(lib.libraryId, (l) =>
        saveFamily(l, word, senseId, choices, {
          kind: "ai",
          provider:
            config.connection === "codex" ? "codex-cli" : config.provider,
          model: config.model,
          at: result.generatedAt ?? new Date().toISOString(),
        }),
      );
      setLib(await store.load(false));
      setSelected({});
      await showToast({
        style: Toast.Style.Success,
        title: "Word Family Saved",
      });
      await autoBackup();
      await onSaved?.();
    } catch (error) {
      await report(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const common = (
    <>
      <Action
        title="Save Selected Candidates"
        icon={Icon.Checkmark}
        onAction={save}
      />
      {!busy && switchAction}
      <Action
        title={result ? "Regenerate with AI" : "Find More with AI"}
        icon={Icon.Stars}
        onAction={() => run(!!result)}
      />
      <Action
        title="Refresh Local Links"
        onAction={async () => {
          setLib(await store.load(false));
          setSelected({});
        }}
      />
      {failure && config?.connection === "codex" && (
        <Action
          title="Retry with API"
          onAction={async () => {
            try {
              const api = await getAPIConfig();
              if (
                await confirmAlert({
                  title: "Retry with paid API?",
                  message:
                    api.provider +
                    " / " +
                    api.model.replace(/\s+/g, " ").slice(0, 48) +
                    ". API charges may apply.",
                })
              )
                await run(false, api);
            } catch (error) {
              await report(error);
            }
          }}
        />
      )}
      <Action
        title="Cancel Request"
        onAction={() => {
          controller.current?.abort();
          setBusy(false);
        }}
      />
    </>
  );
  const open = (w: Word) => (
    <Action
      title="View Existing Word"
      onAction={() => push(<Detail markdown={wordPreview(w)} />)}
    />
  );
  return (
    <List
      isLoading={busy}
      isShowingDetail
      navigationTitle={"Word Family · " + word.word}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Source Sense"
          value={senseId}
          onChange={setSenseId}
        >
          {word.senses.map((s) => (
            <List.Dropdown.Item
              key={s.id}
              value={s.id}
              title={s.pos + " · " + (s.zh || s.en)}
            />
          ))}
        </List.Dropdown>
      }
      actions={<ActionPanel>{common}</ActionPanel>}
    >
      <List.EmptyView
        title={
          busy
            ? "Finding Related Words…"
            : failure
              ? "Generation Failed"
              : result
                ? "No Related Words Found"
                : "No Saved Links"
        }
        description={
          failure ??
          "Only the current word and selected sense are sent. Choose Find More with AI to try again."
        }
      />
      <List.Section title="Saved Word Family">
        {links.map((link, i) => (
          <List.Item
            key={i}
            title={link.word.word}
            subtitle={link.description}
            detail={
              <List.Item.Detail
                markdown={
                  wordPreview(link.word) + "\n\n" + md(link.description)
                }
              />
            }
            actions={
              <ActionPanel>
                {open(link.word)}
                {common}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section
        title={result?.cached ? "Candidates · Cached" : "AI Candidates"}
      >
        {result?.items
          .filter(
            (c) =>
              c.headword &&
              familyMatchKey(c.headword) !== familyMatchKey(word.word),
          )
          .map((c, i) => ({
            c,
            i,
            linked: isLinked(c),
          }))
          .sort((a, b) => Number(a.linked) - Number(b.linked))
          .map(({ c, i, linked }) => {
            const matches = matchBatch.get(familyMatchKey(c.headword!)) ?? [];
            const compatible = matches.filter(
              (w) => compatibleFamilySenses(w, c.pos ?? "").length,
            );
            const rankedMatches = [...matches].sort(
              (a, b) =>
                Number(!compatible.includes(a)) -
                Number(!compatible.includes(b)),
            );
            const chosen = selected[i];
            const toggle = (existingId?: string, targetSenseId?: string) =>
              setSelected((v) => ({
                ...v,
                [i]: { candidate: c, existingId, targetSenseId },
              }));
            const deselect = () =>
              setSelected((v) => {
                const next = { ...v };
                delete next[i];
                return next;
              });
            return (
              <List.Item
                key={i}
                title={c.headword!}
                icon={
                  linked
                    ? { source: Icon.Checkmark, tintColor: Color.SecondaryText }
                    : chosen
                      ? Icon.Checkmark
                      : Icon.Circle
                }
                subtitle={c.pos + " · " + c.zh}
                accessories={[
                  {
                    icon: linked
                      ? {
                          source: Icon.Checkmark,
                          tintColor: Color.SecondaryText,
                        }
                      : matches.length
                        ? Icon.Info
                        : Icon.Plus,
                    tooltip: linked
                      ? "Already Linked"
                      : matches.length
                        ? compatible.length
                          ? "Already in Library · Select a Matching Sense"
                          : "Headword Found · Different Part of Speech · View Only"
                        : "New Word",
                  },
                ]}
                detail={
                  <List.Item.Detail
                    markdown={
                      "# " +
                      md(c.headword!) +
                      "\n\n(" +
                      md(c.pos!) +
                      ") /" +
                      md(c.ipa!) +
                      "/\n\n" +
                      md(c.zh!) +
                      "\n\n" +
                      md(c.en!) +
                      "\n\n" +
                      md(c.text!) +
                      "\n\n" +
                      (linked
                        ? "Already linked — no selection needed."
                        : chosen
                          ? "Selected: " +
                            (chosen.existingId
                              ? "link existing word"
                              : "create new word")
                          : "Not selected")
                    }
                  />
                }
                actions={
                  <ActionPanel>
                    {!linked &&
                      (chosen ? (
                        <Action
                          title="Deselect Candidate"
                          onAction={deselect}
                        />
                      ) : !matches.length ? (
                        <Action
                          title="Select New Word"
                          onAction={() => toggle()}
                        />
                      ) : compatible.length ? (
                        <ActionPanel.Submenu title="Select Existing Sense to Link">
                          {compatible.map((w) => (
                            <ActionPanel.Submenu
                              key={w.id}
                              title={w.word + (w.archived ? " (Archived)" : "")}
                            >
                              {compatibleFamilySenses(w, c.pos ?? "").map(
                                (s) => (
                                  <Action
                                    key={s.id}
                                    title={s.pos + " · " + (s.zh || s.en)}
                                    onAction={() => toggle(w.id, s.id)}
                                  />
                                ),
                              )}
                            </ActionPanel.Submenu>
                          ))}
                        </ActionPanel.Submenu>
                      ) : null)}
                    {rankedMatches.map((w) => (
                      <Action
                        key={w.id}
                        title={
                          "View " +
                          w.word +
                          (compatible.includes(w) ? "" : " · Different POS") +
                          (w.archived ? " (Archived)" : "")
                        }
                        onAction={() =>
                          push(<Detail markdown={wordPreview(w)} />)
                        }
                      />
                    ))}
                    {common}
                  </ActionPanel>
                }
              />
            );
          })}
      </List.Section>
    </List>
  );
}
