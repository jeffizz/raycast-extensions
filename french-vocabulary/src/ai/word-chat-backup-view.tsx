import { Action, ActionPanel, Detail, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import {
  listRemoteWordChats,
  readRemoteWordChat,
  wordChatBackupName,
} from "../core/word-chat-backup";
import type { Word } from "../core/model";
import { md } from "../core/presentation";
import { webdavConfig } from "../runtime";
import { chatLibraryId } from "./word-chat-runtime";

const PAGE_SIZE = 50;

export function RemoteWordChatBackups({ words }: { words: readonly Word[] }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { data, error, isLoading, revalidate } = usePromise(async () => {
    const libraryId = await chatLibraryId();
    const config = webdavConfig();
    const files = await listRemoteWordChats(config, libraryId);
    const names = new Set(files.map((file) => file.name));
    const labels = new Map<string, string>();
    for (const word of words) {
      const name = wordChatBackupName(word.id);
      if (names.has(name)) labels.set(name, word.word);
    }
    return {
      libraryId,
      files: files.map((file) => ({ ...file, label: labels.get(file.name) })),
    };
  });
  const matching = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.files ?? []).filter(
      ({ name, label }) =>
        !search ||
        name.includes(search) ||
        label?.toLowerCase().includes(search),
    );
  }, [data, query]);
  const total = data?.files.length;
  const count =
    total === undefined
      ? ""
      : ` · ${query.trim() ? `${matching.length.toLocaleString()} / ` : ""}${total.toLocaleString()} ${total === 1 ? "file" : "files"}`;
  const refresh = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      onAction={async () => {
        setVisibleCount(PAGE_SIZE);
        await revalidate();
      }}
    />
  );
  return (
    <List
      navigationTitle="Remote Word Chat Backups"
      isLoading={isLoading}
      filtering={false}
      searchBarPlaceholder={`Search backups${count}`}
      onSearchTextChange={(value) => {
        setQuery(value);
        setVisibleCount(PAGE_SIZE);
      }}
      pagination={{
        pageSize: PAGE_SIZE,
        hasMore: visibleCount < matching.length,
        onLoadMore: () => setVisibleCount((count) => count + PAGE_SIZE),
      }}
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      <List.EmptyView
        title={
          error
            ? "Could Not List Remote Backups"
            : total && query.trim()
              ? "No Matching Backups"
              : "No Remote Word Chat Backups"
        }
        description={
          error?.message ??
          (total && query.trim()
            ? "Try a different word or filename."
            : "No saved chat backups were found for the current vocabulary library.")
        }
        actions={<ActionPanel>{refresh}</ActionPanel>}
      />
      {data &&
        matching
          .slice(0, visibleCount)
          .map(({ name, label, size, modified }) => {
            const date = modified ? new Date(modified) : undefined;
            return (
              <List.Item
                key={name}
                id={name}
                title={label ?? name}
                subtitle={label ? name : undefined}
                keywords={[name]}
                icon={Icon.Document}
                accessories={[
                  ...(date && Number.isFinite(date.getTime())
                    ? [{ date }]
                    : []),
                  ...(size !== undefined
                    ? [
                        {
                          text: `${(size / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} KB`,
                        },
                      ]
                    : []),
                ]}
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Inspect Backup"
                      target={
                        <RemoteWordChatPreview
                          libraryId={data.libraryId}
                          name={name}
                          label={label}
                        />
                      }
                    />
                    <Action.CopyToClipboard
                      title="Copy Filename"
                      content={name}
                    />
                    {refresh}
                  </ActionPanel>
                }
              />
            );
          })}
    </List>
  );
}

function RemoteWordChatPreview({
  libraryId,
  name,
  label,
}: {
  libraryId: string;
  name: string;
  label?: string;
}) {
  const { data, error, isLoading } = usePromise(
    (id: string, filename: string) =>
      readRemoteWordChat(webdavConfig(), id, filename),
    [libraryId, name],
  );
  const completed =
    data?.turns.filter((turn) => turn.answer !== null).length ?? 0;
  return (
    <Detail
      navigationTitle="Remote Word Chat Backup"
      isLoading={isLoading}
      markdown={
        error
          ? md(error.message)
          : data
            ? `# ${md(label ?? "Word Chat Backup")}\n\n**File:** \`${name}\`\n\n**Word ID:** ${md(data.wordId)}\n\n${data.turns.length ? `**Completed:** ${completed}\n\n**Unanswered:** ${data.turns.length - completed}` : "**Status:** Chat cleared (empty backup marker)."}`
            : "Loading backup…"
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Filename" content={name} />
        </ActionPanel>
      }
    />
  );
}
