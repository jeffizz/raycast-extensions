import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { autoBackup, preferences, report, store, useLibrary } from "../runtime";
import {
  comparison,
  sessionTranslationLanguage,
  translationValues,
} from "../core/presentation";
import {
  moveGroupWord,
  orderedGroupWords,
  sortedGroupIds,
} from "../core/group-order";
import { speakWord, stopSpeech } from "../speech";
import { statusIcon } from "./status";
import { AIWorkflow } from "../ai/workflow";

export function GroupDetails({ groupId }: { groupId: string }) {
  const { lib, loading, refresh } = useLibrary(false);
  const { push } = useNavigation();
  const group = lib.groups.find((g) => g.id === groupId);
  const words = group ? orderedGroupWords(lib, group) : [];
  const base = preferences().languageMode;
  const {
    value: english = base !== "zh-only",
    setValue: setEnglish,
    isLoading: englishLoading,
  } = useLocalStorage<boolean>(
    `confusion-groups-english-visible-v2-${base ?? "zh-first"}`,
    base !== "zh-only",
  );
  const language = sessionTranslationLanguage(base, english);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => () => stopSpeech(), []);
  const save = async (ids: string[]) => {
    if (!group || lock.current || loading) return;
    lock.current = true;
    setBusy(true);
    try {
      await store.reorderGroup(lib.libraryId, group.id, group.wordIds, ids);
      await refresh();
      void autoBackup();
    } catch (error) {
      await report(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const common = (
    <>
      {group && (
        <Action
          title="Generate Comparison with AI"
          onAction={() =>
            push(
              <AIWorkflow group={group} task="comparison" onSaved={refresh} />,
            )
          }
        />
      )}
      <Action
        title="Sort A–Z"
        onAction={() =>
          group && save(sortedGroupIds(lib, group, "alphabetical"))
        }
      />
      <Action
        title="Use Library Order"
        onAction={() => group && save(sortedGroupIds(lib, group, "library"))}
      />
      {base !== "en-only" && (
        <Action
          title={english ? "Hide English Meanings" : "Show English Meanings"}
          onAction={async () => {
            if (!englishLoading) {
              try {
                await setEnglish(!english);
              } catch (error) {
                await report(error);
              }
            }
          }}
        />
      )}
      <Action
        title="View Comparison Table"
        onAction={() => {
          stopSpeech();
          push(<GroupDocument groupId={groupId} />);
        }}
      />
      <Action
        title="View Group Notes"
        shortcut={Keyboard.Shortcut.Common.New}
        onAction={() => {
          stopSpeech();
          push(<GroupDocument groupId={groupId} notesOnly />);
        }}
      />
      <Action title="Refresh" onAction={refresh} />
    </>
  );
  return (
    <List
      isLoading={loading || busy || englishLoading}
      navigationTitle={group?.name ?? "Confusion Group"}
      actions={<ActionPanel>{common}</ActionPanel>}
    >
      <List.EmptyView title={group ? "No Group Members" : "Group Not Found"} />
      {words.flatMap((word) =>
        word.senses.map((sense) => {
          const icon = statusIcon(word);
          return (
            <List.Item
              key={JSON.stringify([word.id, sense.id])}
              id={JSON.stringify([word.id, sense.id])}
              title={word.word}
              subtitle={[sense.pos, ...translationValues(sense, language)]
                .filter(Boolean)
                .join(" · ")}
              accessories={[
                ...(icon
                  ? [
                      {
                        icon: { source: icon },
                        tooltip: "Familiarity and practice status",
                      },
                    ]
                  : []),
                ...(word.archived
                  ? [{ icon: Icon.Tray, tooltip: "Archived" }]
                  : []),
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Speak"
                    icon={Icon.SpeakerHigh}
                    onAction={() => speakWord(word).catch(report)}
                  />
                  <Action
                    title="Move Word up"
                    shortcut={Keyboard.Shortcut.Common.MoveUp}
                    onAction={() =>
                      group && save(moveGroupWord(group.wordIds, word.id, -1))
                    }
                  />
                  <Action
                    title="Move Word Down"
                    shortcut={Keyboard.Shortcut.Common.MoveDown}
                    onAction={() =>
                      group && save(moveGroupWord(group.wordIds, word.id, 1))
                    }
                  />
                  {common}
                </ActionPanel>
              }
            />
          );
        }),
      )}
    </List>
  );
}

function GroupDocument({
  groupId,
  notesOnly = false,
}: {
  groupId: string;
  notesOnly?: boolean;
}) {
  const { lib, loading, refresh } = useLibrary(false);
  const group = lib.groups.find((g) => g.id === groupId);
  return (
    <Detail
      isLoading={loading}
      navigationTitle={notesOnly ? "Group Notes" : "Comparison Table"}
      markdown={
        !group
          ? "This confusion group no longer exists."
          : notesOnly
            ? group.notes || "No group notes yet."
            : comparison(
                orderedGroupWords(lib, group),
                preferences().languageMode,
              )
      }
      actions={
        <ActionPanel>
          <Action title="Refresh" onAction={refresh} />
        </ActionPanel>
      }
    />
  );
}
