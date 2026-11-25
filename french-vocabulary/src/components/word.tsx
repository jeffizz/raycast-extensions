import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { useState } from "react";
import {
  canonical,
  genderLabel,
  Group,
  Library,
  now,
  Sense,
  uid,
  speechWord,
  setPractice,
  Word,
} from "../core/model";
import { similarWords } from "../core/learning";
import {
  comparison,
  groupName,
  detailMarkdown,
  translations,
  translationValues,
} from "../core/presentation";
import { autoBackup, preferences, report, store, useLibrary } from "../runtime";
import { speakTexts, speakWord, stopSpeech } from "../speech";
import { enrichWord } from "../lexicon";
import { AIWordActions } from "../ai/workflow";
import { RelatedConfusionGroups } from "./related-confusion-groups";

export const escapeMD = (s: string) => s.replace(/[\\`*_{}[\]<>#|]/g, "\\$&");
export function wordMarkdown(w: Word, _lib?: Library, showIPA = false) {
  return detailMarkdown(w, showIPA, preferences().languageMode);
}

export function WordActions({
  word: w,
  refresh,
  practiceShortcut = true,
  selectedSenseId,
}: {
  word: Word;
  refresh: () => Promise<void>;
  practiceShortcut?: boolean;
  selectedSenseId?: string;
}) {
  const { push } = useNavigation();
  const update = async (fn: (w: Word) => void) => {
    try {
      await store.updateWord(w.id, fn);
      await refresh();
      await autoBackup();
    } catch (e) {
      await report(e);
    }
  };
  return (
    <>
      <Action
        title="Speak Word and Articles"
        icon={Icon.SpeakerHigh}
        shortcut={{ modifiers: ["cmd"], key: "b" }}
        onAction={() => speakWord(w).catch(report)}
      />
      <Action title="Stop Audio" icon={Icon.Stop} onAction={stopSpeech} />
      <Action
        title="Find Similar Words"
        icon={Icon.MagnifyingGlass}
        shortcut={Keyboard.Shortcut.Common.Save}
        onAction={() => push(<SimilarWords wordId={w.id} />)}
      />
      <Action
        title="Edit Word and Notes"
        icon={Icon.Pencil}
        shortcut={Keyboard.Shortcut.Common.Edit}
        onAction={() => push(<WordEditor word={w} onSaved={refresh} />)}
      />
      <Action
        title="Manage Senses"
        icon={Icon.Paragraph}
        onAction={() => push(<Senses wordId={w.id} />)}
      />
      <Action
        title="Manage Examples"
        icon={Icon.Text}
        onAction={() => push(<Examples wordId={w.id} />)}
      />
      <Action
        title={w.practice ? "Remove from Practice" : "Add to Practice"}
        icon={Icon.CheckCircle}
        shortcut={
          practiceShortcut ? { modifiers: ["cmd"], key: "t" } : undefined
        }
        onAction={() =>
          update((x) => {
            setPractice(x, !x.practice);
          })
        }
      />
      <Action
        title="Mark Fuzzy"
        icon={Icon.QuestionMarkCircle}
        shortcut={{ modifiers: ["cmd"], key: "1" }}
        onAction={() =>
          update((w) => {
            w.familiarity = "fuzzy";
            delete w.meaningFamiliaritySuccessStreak;
          })
        }
      />
      <Action
        title="Mark Know"
        icon={Icon.CheckCircle}
        shortcut={{ modifiers: ["cmd"], key: "2" }}
        onAction={() =>
          update((w) => {
            w.familiarity = "known";
            delete w.meaningFamiliaritySuccessStreak;
          })
        }
      />
      <Action
        title="Clear Familiarity"
        shortcut={{ modifiers: ["cmd"], key: "0" }}
        onAction={() =>
          update((w) => {
            w.familiarity = "unmarked";
            delete w.meaningFamiliaritySuccessStreak;
          })
        }
      />
      <Action
        title="Confusion Groups"
        shortcut={{ modifiers: ["cmd"], key: "g" }}
        icon={Icon.List}
        onAction={() => {
          stopSpeech();
          push(<RelatedConfusionGroups wordId={w.id} />);
        }}
      />
      <AIWordActions
        word={w}
        onSaved={refresh}
        selectedSenseId={selectedSenseId}
      />
      <Action
        title="Enrich Noun Data from Lexik"
        icon={Icon.Wand}
        onAction={async () => {
          try {
            await store.updateWord(w.id, enrichWord);
            await refresh();
            await autoBackup();
          } catch (e) {
            await report(e);
          }
        }}
      />
      <Action.OpenInBrowser
        title="Look up in Frdic"
        url={`eudic-fr://dict/${encodeURIComponent(speechWord(w))}`}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
      />
      <Action.CopyToClipboard title="Copy Word" content={w.word} />
      <Action
        title={w.archived ? "Restore from Archive" : "Archive Word"}
        icon={Icon.Tray}
        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
        onAction={() =>
          update((x) => {
            x.archived = !x.archived;
          })
        }
      />
    </>
  );
}
export function WordEditor({
  word,
  onSaved,
}: {
  word: Word;
  onSaved: () => Promise<void>;
}) {
  const { pop } = useNavigation(),
    [busy, setBusy] = useState(false);
  type Values = {
    word: string;
    notes: string;
    tags: string;
    speech: string;
    articleOverride: string;
  };
  return (
    <Form
      isLoading={busy}
      navigationTitle="Edit Word"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Word"
            icon={Icon.Check}
            onSubmit={async (v: Values) => {
              if (!v.word.trim()) {
                await report(Error("Word cannot be empty."));
                return;
              }
              setBusy(true);
              try {
                await store.mutate((l) => {
                  const current = l.words.find((x) => x.id === word.id);
                  if (!current) throw Error("Word not found.");
                  if (current.updatedAt !== word.updatedAt)
                    throw Error(
                      "Word changed since this editor opened. Reopen it to avoid overwriting changes.",
                    );
                  if (
                    l.words.some(
                      (x) =>
                        x.id !== word.id &&
                        canonical(x.word) === canonical(v.word),
                    )
                  )
                    throw Error(
                      "That spelling already exists. Edit its senses instead.",
                    );
                  Object.assign(current, {
                    word: canonical(v.word),
                    notes: v.notes,
                    tags: v.tags
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    speech: v.speech.trim(),
                    articleOverride: v.articleOverride.trim(),
                    updatedAt: now(),
                  });
                });
                await onSaved();
                await autoBackup();
                pop();
              } catch (e) {
                await report(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="word" title="French Word" defaultValue={word.word} />
      <Form.TextArea
        id="notes"
        title="Notes (Markdown)"
        defaultValue={word.notes}
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="Separate tags with commas"
        defaultValue={word.tags.join(", ")}
      />
      <Form.TextField
        id="speech"
        title="Pronunciation Override (Optional)"
        placeholder="Optional override; brackets and comma variants are cleaned automatically"
        defaultValue={word.speech}
      />
      <Form.TextArea
        id="articleOverride"
        title="Article Phrase Override"
        placeholder="Optional. One phrase per line; replaces generated phrases."
        defaultValue={word.articleOverride}
      />
      <Form.Description text="Raw IPA is preserved per sense. Article phrases are learning combinations, not a claim that an indefinite article suits every context. Use an override for mass nouns and special usages." />
    </Form>
  );
}
export function Senses({ wordId }: { wordId: string }) {
  const { lib, loading, refresh } = useLibrary(),
    { push } = useNavigation();
  const w = lib.words.find((w) => w.id === wordId);
  return (
    <List
      isLoading={loading}
      isShowingDetail
      navigationTitle={`Senses · ${w?.word ?? ""}`}
    >
      {w?.senses.map((s) => (
        <List.Item
          key={s.id}
          title={s.pos || "Unspecified"}
          subtitle={translationValues(s, preferences().languageMode)
            .filter(Boolean)
            .join(" · ")}
          detail={
            <List.Item.Detail
              markdown={`**IPA:** ${escapeMD(s.ipa)}\n\n${translations(s, preferences().languageMode)}\n\n**Gender:** ${genderLabel(s.gender)}\n\n**Source:** ${s.source ? (s.source.kind === "ai" ? "AI" : "Import") : "Unknown"}\n\n**Gender Source:** ${escapeMD(s.genderSource)}\n\n**Onset:** ${s.onset}`}
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Edit Sense"
                onAction={() =>
                  push(
                    <SenseEditor wordId={wordId} sense={s} onSaved={refresh} />,
                  )
                }
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
function SenseEditor({
  wordId,
  sense: s,
  onSaved,
}: {
  wordId: string;
  sense: Sense;
  onSaved: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  type V = {
    pos: string;
    ipa: string;
    en: string;
    zh: string;
    gender: Sense["gender"];
    plural: boolean;
    onset: Sense["onset"];
  };
  return (
    <Form
      navigationTitle="Edit Sense"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Sense"
            onSubmit={async (v: V) => {
              try {
                await store.updateWord(wordId, (w) => {
                  const i = w.senses.findIndex((x) => x.id === s.id);
                  if (i < 0) throw Error("Sense no longer exists.");
                  if (JSON.stringify(w.senses[i]) !== JSON.stringify(s))
                    throw Error("Sense changed. Reopen the editor.");
                  w.senses[i] = { ...s, ...v, genderSource: "user" };
                });
                await onSaved();
                await autoBackup();
                pop();
              } catch (e) {
                await report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="pos" title="Part of Speech" defaultValue={s.pos} />
      <Form.TextField id="ipa" title="IPA (Original)" defaultValue={s.ipa} />
      {(preferences().languageMode?.startsWith("en")
        ? (["en", "zh"] as const)
        : (["zh", "en"] as const)
      ).map((language) => (
        <Form.TextArea
          key={language}
          id={language}
          title={language === "zh" ? "Chinese" : "English"}
          defaultValue={s[language]}
        />
      ))}
      <Form.Dropdown id="gender" title="Gender" defaultValue={s.gender}>
        {(["unknown", "m", "f", "both"] as const).map((g) => (
          <Form.Dropdown.Item key={g} value={g} title={genderLabel(g)} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="plural"
        label="This is a plural form"
        defaultValue={s.plural}
      />
      <Form.Dropdown
        id="onset"
        title="Initial Sound / Elision"
        defaultValue={s.onset}
      >
        {["unknown", "vowel", "consonant", "mute-h", "aspirated-h"].map((x) => (
          <Form.Dropdown.Item key={x} value={x} title={x} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
export function Examples({ wordId }: { wordId: string }) {
  const { lib, loading, refresh } = useLibrary(),
    { push } = useNavigation();
  const w = lib.words.find((w) => w.id === wordId);
  const editor = (id?: string) => {
    const e = w?.examples.find((x) => x.id === id);
    push(
      <Form
        navigationTitle="Example"
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Save Example"
              onSubmit={async (v: { french: string; translation: string }) => {
                if (!v.french.trim()) {
                  await report(Error("French example cannot be empty."));
                  return;
                }
                try {
                  await store.updateWord(wordId, (w) => {
                    if (e) {
                      const i = w.examples.findIndex((x) => x.id === e.id);
                      if (i < 0) throw Error("Example was removed.");
                      if (JSON.stringify(w.examples[i]) !== JSON.stringify(e))
                        throw Error("Example changed. Reopen the editor.");
                      w.examples[i] = { ...e, ...v };
                    } else w.examples.push({ id: uid(), ...v });
                  });
                  await refresh();
                  await autoBackup();
                  pop();
                } catch (e) {
                  await report(e);
                }
              }}
            />
          </ActionPanel>
        }
      >
        <Form.TextArea id="french" title="French" defaultValue={e?.french} />
        <Form.TextArea
          id="translation"
          title="Translation"
          defaultValue={e?.translation}
        />
      </Form>,
    );
  };
  const { pop } = useNavigation();
  return (
    <List
      isLoading={loading}
      navigationTitle={`Examples · ${w?.word ?? ""}`}
      actions={
        <ActionPanel>
          <Action
            title="Add Example"
            icon={Icon.Plus}
            onAction={() => editor()}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title="No examples"
        description="Add French examples with optional translations."
      />
      {w?.examples.map((e) => (
        <List.Item
          key={e.id}
          title={e.french}
          subtitle={e.translation}
          actions={
            <ActionPanel>
              <Action
                title="Speak Example"
                onAction={() => speakTexts([e.french]).catch(report)}
              />
              <Action title="Edit Example" onAction={() => editor(e.id)} />
              <Action title="Add Example" onAction={() => editor()} />
              <Action
                title="Delete Example"
                style={Action.Style.Destructive}
                onAction={async () => {
                  try {
                    await store.updateWord(wordId, (w) => {
                      w.examples = w.examples.filter((x) => x.id !== e.id);
                    });
                    await refresh();
                    await autoBackup();
                  } catch (e) {
                    await report(e);
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
export function AddToGroup({ ids }: { ids: string[] }) {
  const { lib, loading } = useLibrary(),
    { push, pop } = useNavigation();
  const add = async (groupId: string) => {
    try {
      await store.mutate((l) => {
        const g = l.groups.find((g) => g.id === groupId);
        if (!g) throw Error("Group not found.");
        const oldName = groupName(
          g.wordIds
            .map((id) => l.words.find((w) => w.id === id))
            .filter((w): w is Word => !!w),
        );
        g.wordIds = [...new Set([...g.wordIds, ...ids])];
        if (g.name === oldName)
          g.name = groupName(
            g.wordIds
              .map((id) => l.words.find((w) => w.id === id))
              .filter((w): w is Word => !!w),
          );
        g.updatedAt = now();
      });
      await autoBackup();
      await showToast({ style: Toast.Style.Success, title: "Added to group" });
      pop();
    } catch (e) {
      await report(e);
    }
  };
  return (
    <List isLoading={loading} navigationTitle="Add to Confusion Group">
      <List.Item
        title="Create New Group"
        icon={Icon.Plus}
        actions={
          <ActionPanel>
            <Action
              title="Create Group"
              onAction={() =>
                push(
                  <GroupEditor
                    initialIds={ids}
                    onSaved={async () => {
                      pop();
                      pop();
                    }}
                  />,
                )
              }
            />
          </ActionPanel>
        }
      />
      {lib.groups.map((g) => (
        <List.Item
          key={g.id}
          title={g.name}
          accessories={[{ text: `${g.wordIds.length} words` }]}
          actions={
            <ActionPanel>
              <Action title="Add to Group" onAction={() => add(g.id)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
export function GroupEditor({
  group,
  initialIds = [],
  onSaved,
}: {
  group?: Group;
  initialIds?: string[];
  onSaved: () => Promise<void>;
}) {
  const { lib } = useLibrary();
  const [selectedIds, setSelectedIds] = useState(group?.wordIds ?? initialIds);
  const [customName, setCustomName] = useState<string | undefined>(group?.name);
  const automaticName = groupName(
    selectedIds
      .map((id) => lib.words.find((w) => w.id === id))
      .filter((w): w is Word => !!w),
  );
  return (
    <Form
      navigationTitle={group ? "Edit Confusion Group" : "New Confusion Group"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Group"
            onSubmit={async (v: {
              name: string;
              notes: string;
              wordIds: string[];
            }) => {
              if (!v.wordIds.length) {
                await report(Error("Select at least one word."));
                return;
              }
              v.name = v.name.trim() || automaticName;
              try {
                await store.mutate((l) => {
                  if (group) {
                    const old = l.groups.find((x) => x.id === group.id);
                    if (!old || old.updatedAt !== group.updatedAt)
                      throw Error("Group changed. Reopen the editor.");
                    Object.assign(old, {
                      ...v,
                      name: v.name.trim(),
                      updatedAt: now(),
                    });
                  } else
                    l.groups.push({
                      id: uid(),
                      ...v,
                      name: v.name.trim(),
                      updatedAt: now(),
                    });
                });
                await autoBackup();
                await onSaved();
              } catch (e) {
                await report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name (Optional)"
        value={customName ?? automaticName}
        onChange={setCustomName}
      />
      <Form.TagPicker
        id="wordIds"
        title="Words"
        value={selectedIds}
        onChange={(value) => {
          const previousAutomatic = groupName(
            selectedIds
              .map((id) => lib.words.find((w) => w.id === id))
              .filter((w): w is Word => !!w),
          );
          setSelectedIds(value);
          if (customName === previousAutomatic) setCustomName(undefined);
        }}
      >
        {lib.words.map((w) => (
          <Form.TagPicker.Item
            key={w.id}
            value={w.id}
            title={`${w.word}${w.archived ? " (archived)" : ""}`}
          />
        ))}
      </Form.TagPicker>
      <Form.TextArea
        id="notes"
        title="Comparison Notes (Markdown)"
        defaultValue={group?.notes}
      />
    </Form>
  );
}
export function SimilarWords({ wordId }: { wordId: string }) {
  const { lib, loading, refresh } = useLibrary(),
    { push, pop } = useNavigation();
  const w = lib.words.find((w) => w.id === wordId);
  const matches = w ? similarWords(lib, w) : [];
  return (
    <List
      isLoading={loading}
      isShowingDetail
      navigationTitle={`Similar to ${w?.word ?? "…"}`}
      actions={
        <ActionPanel>
          <Action
            title="Link Any Word Manually"
            shortcut={{ modifiers: ["cmd"], key: "g" }}
            onAction={() =>
              push(
                <GroupEditor
                  initialIds={[wordId]}
                  onSaved={async () => {
                    await refresh();
                    pop();
                  }}
                />,
              )
            }
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title="No similar words in your library"
        description="Import more words, or create a confusion group manually."
      />
      {matches.map(({ word: x, score, linked }) => (
        <List.Item
          key={x.id}
          title={x.word}
          subtitle={
            linked
              ? "Saved group connection"
              : `Spelling similarity ${Math.round(score * 100)}%`
          }
          detail={
            <List.Item.Detail
              markdown={comparison(
                w ? [w, x] : [x],
                preferences().languageMode,
              )}
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Save Pair to Confusion Group"
                shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
                onAction={() => push(<AddToGroup ids={[wordId, x.id]} />)}
              />
              <Action
                title="Link Any Word Manually"
                onAction={() =>
                  push(
                    <GroupEditor
                      initialIds={[wordId]}
                      onSaved={async () => {
                        await refresh();
                        pop();
                      }}
                    />,
                  )
                }
              />
              <WordActions word={x} refresh={refresh} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
