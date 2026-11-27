import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Color,
  List,
  confirmAlert,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useLocalStorage, usePromise, useForm } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { autoBackup, report, store } from "../runtime";
import { emptyLibrary, Group, Word } from "../core/model";
import {
  Candidate,
  comparisonInput,
  providers,
  safeVocabulary,
  Task,
  parseCandidates,
} from "./core";
import {
  generate,
  getConfig,
  getAPIConfig,
  AIConfig,
  AIResult,
} from "./client";
import {
  generationInput,
  existingForSense,
  candidateMatch,
  sameSenseHeadword,
} from "./duplicates";
import { WordFamily } from "./family-view";
import { familyMatchBatch, familyMatchKey } from "./family";
import { candidateSaveSummary, saveAI, separateSenseHeadword } from "./save";
import { md } from "../core/presentation";
import { stopSpeech } from "../speech";
import { WordChatView } from "./word-chat-view";
const wordTasks = ["senses", "examples", "mnemonic", "collocations"] as const;
type WordTool = (typeof wordTasks)[number] | "family" | "chat";
type WordToolProps = {
  allowChat?: boolean;
  word: Word;
  selectedSenseId?: string;
  onSaved?: () => Promise<void>;
};
type SwitchActions = (senseId?: string) => React.ReactElement;

function wordToolMenu({
  current,
  allowChat = true,
  onChoose,
}: {
  current?: WordTool;
  allowChat?: boolean;
  onChoose: (tool: WordTool) => void;
}) {
  return (
    <ActionPanel.Submenu
      title={current ? "Switch AI Vocabulary Tool" : "AI Vocabulary"}
      icon={Icon.Stars}
      shortcut={current ? { modifiers: ["cmd", "shift"], key: "j" } : undefined}
    >
      {wordTasks
        .filter((task) => task !== current)
        .map((task) => (
          <Action
            key={task}
            title={task[0].toUpperCase() + task.slice(1)}
            onAction={() => onChoose(task)}
          />
        ))}
      {current !== "family" && (
        <Action title="Word Family" onAction={() => onChoose("family")} />
      )}
      {allowChat && current !== "chat" && (
        <Action
          title="Chat About This Word"
          onAction={() => onChoose("chat")}
        />
      )}
    </ActionPanel.Submenu>
  );
}

export function AIWordActions(props: WordToolProps) {
  const { push } = useNavigation();
  return wordToolMenu({
    allowChat: props.allowChat,
    onChoose: (tool) => {
      if (tool === "chat") stopSpeech();
      push(<AIWordTool {...props} initialTool={tool} />);
    },
  });
}

function AIWordTool({
  initialTool,
  word,
  selectedSenseId,
  onSaved,
  allowChat,
}: WordToolProps & { initialTool: WordTool }) {
  const [{ tool, senseId }, setTool] = useState({
    tool: initialTool,
    senseId: selectedSenseId,
  });
  const switchActions: SwitchActions = (nextSense = senseId) =>
    wordToolMenu({
      current: tool,
      allowChat,
      onChoose: (next) => {
        if (next === "chat") stopSpeech();
        setTool({ tool: next, senseId: nextSense });
      },
    });

  // Replace the mounted tool rather than stacking pages on repeated switches.
  if (tool === "family")
    return (
      <WordFamily
        key={tool}
        word={word}
        selectedSenseId={senseId}
        onSaved={onSaved}
        switchActions={switchActions}
      />
    );
  if (tool === "chat")
    return (
      <WordChatView
        key={tool}
        word={word}
        senseId={senseId}
        switchAction={switchActions()}
      />
    );
  return (
    <AIWorkflow
      key={tool}
      word={word}
      task={tool}
      selectedSenseId={senseId}
      onSaved={onSaved}
      switchActions={switchActions}
    />
  );
}
export function AIWorkflow({
  word,
  task = "senses",
  selectedSenseId,
  group,
  onSaved,
  switchActions,
}: {
  switchActions?: SwitchActions;
  word?: Word;
  task?: Task;
  selectedSenseId?: string;
  group?: Group;
  onSaved?: () => Promise<void>;
}) {
  const { data, isLoading } = usePromise(async () => ({
    lib:
      word && !group
        ? await store.loadWordContent(word.id)
        : await store.load(false),
    config: await getConfig(),
    clipboard:
      word || group ? "" : safeVocabulary((await Clipboard.readText()) ?? ""),
  }));
  const switchAction = switchActions?.();
  if (isLoading)
    return (
      <List
        isLoading
        actions={switchAction && <ActionPanel>{switchAction}</ActionPanel>}
      />
    );
  if (!data)
    return (
      <List actions={switchAction && <ActionPanel>{switchAction}</ActionPanel>}>
        <List.EmptyView
          title="AI Not Configured"
          actions={switchAction && <ActionPanel>{switchAction}</ActionPanel>}
          description="Open Dashboard → AI Settings & Keys."
        />
      </List>
    );
  return (
    <GenerateForm
      word={
        word
          ? (data.lib.words.find((w) => w.id === word.id) ?? word)
          : undefined
      }
      task={task}
      group={
        group
          ? (data.lib.groups.find((g) => g.id === group.id) ?? group)
          : undefined
      }
      onSaved={onSaved}
      data={data}
      switchActions={switchActions}
      selectedSenseId={selectedSenseId}
    />
  );
}
function GenerateForm({
  word,
  task,
  group,
  onSaved,
  data,
  selectedSenseId,
  switchActions,
}: {
  switchActions?: SwitchActions;
  word?: Word;
  task: Task;
  selectedSenseId?: string;
  group?: Group;
  onSaved?: () => Promise<void>;
  data: {
    lib: Awaited<ReturnType<typeof store.load>>;
    config: Awaited<ReturnType<typeof getConfig>>;
    clipboard: string;
  };
}) {
  const initialSenseId =
    word?.senses.find((s) => s.id === selectedSenseId)?.id ??
    word?.senses[0]?.id ??
    "";
  const { push } = useNavigation();
  const [busy, setBusy] = useState(false);
  const [searchSources, setSearchSources] = useState(false);
  const [failure, setFailure] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  const requestLock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const direct =
    !!word && !group && (task === "senses" || word.senses.length === 1);
  const [review, setReview] = useState<React.ReactElement>();
  const started = useRef(false);
  const run = async (
    values: { spelling: string; sense: string; members: string[] },
    override?: AIConfig,
  ) => {
    const config = override ?? data.config;
    if (busy || requestLock.current) return;
    requestLock.current = true;
    setFailure(undefined);
    try {
      const spelling = group
        ? ""
        : (word?.word ?? safeVocabulary(values.spelling ?? ""));
      if (!group && !spelling)
        throw Error(
          "Enter a short vocabulary word or phrase, not private information.",
        );
      if (!word && !group && task === "senses") {
        const matches =
          familyMatchBatch(data.lib, [spelling]).get(
            familyMatchKey(spelling),
          ) ?? [];
        if (matches.length) {
          push(
            <List
              navigationTitle="Matching Vocabulary"
              searchBarPlaceholder="Choose an existing word…"
            >
              <List.Section title="Already in Your Library">
                {matches.map((match) => (
                  <List.Item
                    key={match.id}
                    title={match.word}
                    subtitle={[
                      match.archived ? "Archived" : "",
                      match.senses[0]?.zh || match.senses[0]?.en,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    actions={
                      <ActionPanel>
                        <Action.Push
                          title="Open Existing Senses"
                          target={
                            <AIWordTool
                              word={match}
                              initialTool="senses"
                              onSaved={onSaved}
                            />
                          }
                        />
                      </ActionPanel>
                    }
                  />
                ))}
              </List.Section>
            </List>,
          );
          return;
        }
      }
      const input = group
        ? comparisonInput(data.lib.words, values.members ?? [])
        : generationInput(spelling, word, task, values.sense, searchSources);
      setBusy(true);
      controller.current = new AbortController();
      const result = await generate(
        config,
        task,
        input,
        controller.current.signal,
        false,
        searchSources,
      );
      const reviewPage = (
        <CandidateReview
          result={result}
          direct={direct || !!switchActions}
          switchAction={switchActions?.(values.sense || undefined)}
          onChangeOptions={
            switchActions && !direct ? () => setReview(undefined) : undefined
          }
          word={word}
          group={group}
          spelling={spelling}
          task={task}
          libraryId={data.lib.libraryId}
          collections={data.lib.settings?.collections ?? []}
          onSaved={onSaved}
          senseId={values.sense}
          provider={
            config.connection === "codex" ? "codex-cli" : config.provider
          }
          model={config.model}
          regenerate={async (signal) =>
            generate(config, task, input, signal, true, searchSources)
          }
        />
      );
      if (direct || switchActions) setReview(reviewPage);
      else push(reviewPage);
    } catch (e) {
      if (!controller.current?.signal.aborted) {
        setFailure(e instanceof Error ? e.message : "Generation failed.");
        await report(e);
      }
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  };
  const defaults = {
    spelling: word?.word ?? data.clipboard,
    sense: initialSenseId,
    members: group?.wordIds.slice(0, 6) ?? [],
  };
  const {
    itemProps,
    handleSubmit,
    values: formValues,
  } = useForm<{
    spelling: string;
    sense: string;
    members: string[];
  }>({ initialValues: defaults, onSubmit: (values) => run(values) });
  useEffect(() => {
    let active = true;
    // Defer until mount settles so effect cleanup cannot abort the only initial request.
    void Promise.resolve().then(() => {
      if (active && direct && !started.current) {
        started.current = true;
        void run(defaults);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const retryAPI =
    failure && data.config.connection === "codex" ? (
      <Action
        title="Retry with API"
        onAction={async () => {
          if (busy || requestLock.current) return;
          try {
            const api = await getAPIConfig();
            if (
              !(await confirmAlert({
                title: "Retry with paid API?",
                message:
                  "Send this vocabulary request to " +
                  providers[api.provider] +
                  " / " +
                  api.model.replace(/\s+/g, " ").slice(0, 48) +
                  ". API charges may apply. The default connection remains Codex CLI.",
              }))
            )
              return;
            await run(direct ? defaults : { ...defaults, ...formValues }, api);
          } catch (error) {
            await report(error);
          }
        }}
      />
    ) : null;
  if (review) return review;
  if (direct)
    return (
      <List
        isLoading={busy}
        navigationTitle="AI Vocabulary"
        actions={
          <ActionPanel>
            <Action title="Retry Generation" onAction={() => run(defaults)} />
            {retryAPI}
            <Action
              title="Cancel Request"
              onAction={() => controller.current?.abort()}
            />
            {switchActions?.(initialSenseId || undefined)}
          </ActionPanel>
        }
      >
        <List.EmptyView
          title={busy ? "Generating Candidates…" : "No Candidates Yet"}
          description={
            busy
              ? "Checking cache or requesting AI content."
              : (failure ?? "Use Retry Generation to try again.")
          }
        />
      </List>
    );
  return (
    <Form
      isLoading={busy}
      navigationTitle="AI Vocabulary"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Generate Candidates"
            onSubmit={handleSubmit}
          />
          {retryAPI}
          <Action
            title="Cancel Request"
            onAction={() => controller.current?.abort()}
          />
          {switchActions?.(formValues.sense || undefined)}
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          "Provider: " +
          (data.config.connection === "codex"
            ? "Codex CLI (ChatGPT login)"
            : providers[data.config.provider]) +
          " · Model: " +
          data.config.model +
          ". Generate Candidates sends the displayed word and selected meanings and may incur charges. Only task-relevant existing content is included for comparison; no learning history or general notes are sent. Clipboard screening cannot identify every secret."
        }
      />
      {word ? (
        <Form.Description title="Vocabulary" text={word.word} />
      ) : (
        !group && <Form.TextField title="Vocabulary" {...itemProps.spelling} />
      )}
      {word && task !== "senses" && (
        <Form.Dropdown title="Target Sense" {...itemProps.sense}>
          {word.senses.map((s) => (
            <Form.Dropdown.Item
              key={s.id}
              value={s.id}
              title={[s.pos, s.zh, s.en].join(" · ")}
            />
          ))}
        </Form.Dropdown>
      )}
      {group && (
        <Form.TagPicker title="Words to Compare" {...itemProps.members}>
          {group.wordIds.map((id) => (
            <Form.TagPicker.Item
              key={id}
              value={id}
              title={data.lib.words.find((w) => w.id === id)?.word ?? id}
            />
          ))}
        </Form.TagPicker>
      )}
      {(task === "history" || task === "mnemonic") && (
        <>
          <Form.Checkbox
            id="search-sources"
            label="Search for Sources (Optional)"
            value={searchSources}
            onChange={setSearchSources}
          />
          <Form.Description text="Off: short unverified story summary using the selected provider, without web search. On: OpenAI web search with citations and additional costs; no automatic provider switch." />
        </>
      )}
      {task === "mnemonic" && (
        <Form.Description text="One or two short memory cues: useful word connections or known anecdotes. Folklore is labeled; no invented stories. Search for Sources is optional and may cost more." />
      )}
    </Form>
  );
}
function CandidateReview({
  result,
  word,
  group,
  spelling,
  task,
  libraryId,
  collections,
  onSaved,
  regenerate,
  senseId,
  provider,
  model,
  direct = false,
  switchAction,
  onChangeOptions,
}: {
  switchAction?: React.ReactElement;
  onChangeOptions?: () => void;
  result: AIResult;
  word?: Word;
  group?: Group;
  spelling: string;
  task: Task;
  libraryId: string;
  collections: { id: string; name: string }[];
  onSaved?: () => Promise<void>;
  regenerate: (signal: AbortSignal) => Promise<AIResult>;
  senseId?: string;
  provider: string;
  model: string;
  direct?: boolean;
}) {
  const { pop, push } = useNavigation();
  const regeneration = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => regeneration.current?.abort(), []);
  const {
    value: separatePronominal = true,
    setValue: setSeparatePronominal,
    isLoading: preferenceLoading,
  } = useLocalStorage<boolean>("ai-separate-pronominal", true);
  const [currentResult, setCurrentResult] = useState(result);
  const [items, setItems] = useState(result.items);
  const [selected, setSelected] = useState<number[]>([]);
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [allowNew, setAllowNew] = useState<Record<number, boolean>>({});
  const matchFor = (c: Candidate) => candidateMatch(c, word, task, senseId);
  const covered = (c: Candidate, i: number) =>
    matchFor(c)?.status === "equivalent" && !allowNew[i] && !targets[i];
  const [collection, setCollection] = useState("");
  const [append, setAppend] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current || busy || preferenceLoading) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!selected.length) throw Error("Select at least one candidate.");
      if (selected.some((i) => covered(items[i], i)))
        throw Error(
          "Choose an explicit update or Treat as New before saving covered content.",
        );
      const chosen = selected.map((i) => items[i]);
      if (
        !(await confirmAlert({
          title: "Save selected AI content?",
          message: candidateSaveSummary({
            count: chosen.length,
            replacements: selected.filter((i) => targets[i]).length,
            notesDestination: group
              ? "group notes"
              : task === "mnemonic" || task === "history"
                ? "the word's mnemonic"
                : undefined,
            append,
            collectionName: collections.find((c) => c.id === collection)?.name,
          }),
        }))
      )
        return;
      const options = {
        word,
        spelling,
        task,
        senseId,
        items: chosen,
        separatePronominal,
        provider,
        model,
        generatedAt: currentResult.generatedAt,
        targets: selected.map((i) => targets[i] ?? ""),
        collectionId: collection,
        groupId: group?.id,
        groupBefore: group ? JSON.stringify(group) : undefined,
        append,
      };
      if (
        word &&
        !group &&
        !collection &&
        (task !== "senses" ||
          !chosen.some((item) =>
            separateSenseHeadword(item, word, separatePronominal),
          ))
      ) {
        await store.updateWord(
          word.id,
          (current) => {
            const lib = emptyLibrary();
            lib.words = [current];
            saveAI(lib, options);
          },
          libraryId,
        );
      } else {
        await store.mutateContent(libraryId, (lib) => saveAI(lib, options));
      }
      void autoBackup();
      await onSaved?.();
      await showToast({
        style: Toast.Style.Success,
        title: "AI Content Saved",
      });
      pop();
      if (!direct) pop();
    } catch (e) {
      await report(e);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const common = (
    <>
      <Action title="Save Selected Candidates" onAction={save} />
      {!busy && switchAction}
      {!busy && onChangeOptions && (
        <Action title="Change Generation Options" onAction={onChangeOptions} />
      )}
      {task === "senses" && (
        <Action
          title={
            separatePronominal
              ? "Keep Pronominal Senses in Current Word"
              : "Save Pronominal Senses as Separate Words"
          }
          onAction={() => {
            void setSeparatePronominal(!separatePronominal).catch(report);
          }}
        />
      )}
      {!word && !group && (
        <ActionPanel.Submenu title="Collection">
          {[{ id: "", name: "No Collection" }, ...collections].map((c) => (
            <Action
              key={c.id}
              title={c.name}
              onAction={() => setCollection(c.id)}
            />
          ))}
        </ActionPanel.Submenu>
      )}
      {!group && (task === "mnemonic" || task === "history") && (
        <Action
          title={
            append
              ? "Use Replace Instead of Append"
              : "Use Append Instead of Replace"
          }
          onAction={() => setAppend((v) => !v)}
        />
      )}
      <Action
        title={
          provider === "codex-cli"
            ? "Regenerate (Uses Codex Quota)"
            : "Regenerate (Uses API Credits)"
        }
        onAction={async () => {
          if (
            busy ||
            !(await confirmAlert({
              title: "Request new candidates?",
              message:
                provider === "codex-cli"
                  ? "This starts another Codex task and uses subscription quota."
                  : "This makes another paid API request.",
            }))
          )
            return;
          setBusy(true);
          try {
            regeneration.current = new AbortController();
            const next = await regenerate(regeneration.current.signal);
            setCurrentResult(next);
            setItems(next.items);
            setSelected([]);
            setTargets({});
            setAllowNew({});
          } catch (e) {
            await report(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
  const existing = existingContentPreview(word, task, senseId);
  return (
    <List
      isLoading={busy}
      isShowingDetail
      navigationTitle={
        "AI Review · " + (currentResult.cached ? "Cached" : "Generated")
      }
      searchBarPlaceholder="Select candidates, edit, then save…"
      actions={<ActionPanel>{common}</ActionPanel>}
    >
      {task === "senses" && word && (
        <List.Section title="Existing Senses">
          {word.senses.map((s) => (
            <List.Item
              key={"existing-" + s.id}
              id={"existing-" + s.id}
              title={s.zh || s.en}
              subtitle={s.pos}
              accessories={[{ icon: Icon.Info, tooltip: "Existing Sense" }]}
              detail={<List.Item.Detail markdown={sensePreview(spelling, s)} />}
              actions={<ActionPanel>{common}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}
      {existing && (
        <List.Section title={existing.title}>
          {existing.rows.map(({ id, title, subtitle, markdown }) => (
            <List.Item
              key={id}
              id={`existing-${id}`}
              title={title}
              subtitle={subtitle}
              detail={<List.Item.Detail markdown={markdown} />}
              actions={<ActionPanel>{common}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}
      <List.Section title="AI Candidates">
        {items
          .map((c, i) => ({ c, i }))
          .sort((a, b) => Number(covered(a.c, a.i)) - Number(covered(b.c, b.i)))
          .map(({ c, i }) => (
            <List.Item
              key={i}
              id={String(i)}
              title={
                c.pattern ??
                c.zh ??
                c.french ??
                (task === "mnemonic"
                  ? c.text?.replace(/\s+/g, " ").slice(0, 100)
                  : undefined) ??
                "Suggestion " + (i + 1)
              }
              icon={
                covered(c, i)
                  ? { source: Icon.Checkmark, tintColor: Color.SecondaryText }
                  : selected.includes(i)
                    ? Icon.Checkmark
                    : Icon.Circle
              }
              accessories={
                targets[i]
                  ? [{ icon: Icon.Pencil, tooltip: "Replace existing sense" }]
                  : task === "senses" &&
                      separatePronominal &&
                      c.headword &&
                      /^(se\s|s['’])/i.test(c.headword) &&
                      !sameSenseHeadword(c.headword, spelling)
                    ? [{ icon: Icon.Plus, tooltip: "Save to " + c.headword }]
                    : matchFor(c)?.status === "equivalent"
                      ? [
                          {
                            icon: {
                              source: Icon.Checkmark,
                              tintColor: Color.SecondaryText,
                            },
                            tooltip: "Already Covered",
                          },
                        ]
                      : matchFor(c)?.status === "overlap"
                        ? [
                            {
                              icon: {
                                source: Icon.Info,
                                tintColor: Color.Orange,
                              },
                              tooltip: "Possible Overlap",
                            },
                          ]
                        : []
              }
              detail={
                <List.Item.Detail
                  markdown={
                    (task === "senses"
                      ? sensePreview(c.headword || spelling, c)
                      : Object.entries(c)
                          .filter(
                            ([key]) => !["match", "existingRef"].includes(key),
                          )
                          .map(([, v]) => v)
                          .join("\n\n")) +
                    (matchFor(c)
                      ? "\n\n## Existing Match\n\n" +
                        md(matchFor(c)!.summary) +
                        "\n\nReview the match before saving."
                      : "") +
                    (targets[i]
                      ? "\n\n## Existing Sense\n\n" +
                        sensePreview(
                          spelling,
                          word?.senses.find((s) => s.id === targets[i]) ?? {},
                        )
                      : "")
                  }
                />
              }
              actions={
                <ActionPanel>
                  {!covered(c, i) && (
                    <Action
                      title={
                        selected.includes(i)
                          ? "Deselect Candidate"
                          : "Select Candidate"
                      }
                      onAction={() =>
                        setSelected((s) =>
                          s.includes(i) ? s.filter((n) => n !== i) : [...s, i],
                        )
                      }
                    />
                  )}
                  {matchFor(c)?.senseId && (
                    <Action
                      title="Update Existing Sense"
                      onAction={() => {
                        setTargets((t) => ({
                          ...t,
                          [i]: matchFor(c)!.senseId!,
                        }));
                        setSelected((s) => (s.includes(i) ? s : [...s, i]));
                      }}
                    />
                  )}
                  {matchFor(c) && (
                    <Action
                      title={
                        task === "senses"
                          ? "Treat as New Sense"
                          : "Treat as New Candidate"
                      }
                      onAction={() => {
                        setAllowNew((v) => ({ ...v, [i]: true }));
                        setTargets((t) => ({ ...t, [i]: "" }));
                      }}
                    />
                  )}
                  <Action
                    title="Edit Candidate"
                    onAction={() =>
                      push(
                        <EditCandidate
                          item={c}
                          task={task}
                          onSave={(item) => {
                            setItems((old) =>
                              old.map((v, n) => (n === i ? item : v)),
                            );
                            setSelected((s) => s.filter((n) => n !== i));
                            setTargets((t) => ({ ...t, [i]: "" }));
                            setAllowNew((v) => ({ ...v, [i]: false }));
                            pop();
                          }}
                        />,
                      )
                    }
                  />
                  {word && task === "senses" && (
                    <ActionPanel.Submenu title="Replace Existing Sense">
                      <Action
                        title="Add as New Sense"
                        onAction={() => {
                          setTargets((t) => ({ ...t, [i]: "" }));
                          setAllowNew((v) => ({ ...v, [i]: true }));
                        }}
                      />
                      {word.senses.map((s) => (
                        <Action
                          key={s.id}
                          title={[s.pos, s.zh, s.en].join(" · ")}
                          onAction={() =>
                            setTargets((t) => ({ ...t, [i]: s.id }))
                          }
                        />
                      ))}
                    </ActionPanel.Submenu>
                  )}
                  {common}
                </ActionPanel>
              }
            />
          ))}
      </List.Section>
    </List>
  );
}
function existingContentPreview(
  word: Word | undefined,
  task: Task,
  senseId?: string,
) {
  if (!word) return;
  type Row = { id: string; title: string; subtitle?: string; markdown: string };
  let title: string;
  let rows: Row[];
  if (task === "examples") {
    title = "Existing Examples";
    rows = existingForSense(word.examples, senseId).map((item) => ({
      id: item.id,
      title: item.french,
      subtitle: item.senseId ? undefined : "Word-Level",
      markdown: [md(item.french), md(item.translation)]
        .filter(Boolean)
        .join("\n\n"),
    }));
  } else if (task === "collocations") {
    title = "Existing Collocations";
    rows = existingForSense(word.collocationEntries ?? [], senseId).map(
      (item) => ({
        id: `collocation-${item.id}`,
        title: item.pattern,
        subtitle: item.senseId ? undefined : "Word-Level",
        markdown: [
          `### ${md(item.pattern)}`,
          md(item.meaning),
          md(item.french),
          md(item.translation),
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    );
    if (word.collocations?.trim())
      rows.push({
        id: "legacy",
        title: "Legacy Collocations",
        markdown: word.collocations,
      });
  } else if (task === "mnemonic") {
    title = "Existing Mnemonic";
    rows = word.mnemonic?.trim()
      ? [{ id: "mnemonic", title: "Saved Mnemonic", markdown: word.mnemonic }]
      : [];
  } else return;
  return rows.length ? { title, rows } : undefined;
}

function sensePreview(spelling: string, sense: Candidate) {
  return `# ${md(spelling)}\n\n/${md((sense.ipa ?? "").replaceAll("/", ""))}/\n\n(${md(sense.pos ?? "")})\n\n${md(sense.zh ?? "")}\n\n${md(sense.en ?? "")}`;
}
function EditCandidate({
  item,
  task,
  onSave,
}: {
  item: Candidate;
  task: Task;
  onSave: (c: Candidate) => void;
}) {
  const { itemProps, handleSubmit } = useForm<Record<string, string>>({
    initialValues: item as Record<string, string>,
    onSubmit: async (values) => {
      try {
        const edited = { ...values };
        delete edited.match;
        delete edited.existingRef;
        onSave(parseCandidates(JSON.stringify({ items: [edited] }), task)[0]);
      } catch (e) {
        await report(e);
      }
    },
  });
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply Edits" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {Object.keys(item)
        .filter((key) => !["match", "existingRef"].includes(key))
        .map((key) => (
          <Form.TextArea key={key} title={key} {...itemProps[key]} />
        ))}
    </Form>
  );
}
