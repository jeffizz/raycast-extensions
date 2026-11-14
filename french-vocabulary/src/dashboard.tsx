import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Detail,
  environment,
  Form,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  backupRemote,
  backupPolicy,
  BackupState,
  downloadBackup,
  restoreRemote,
  target,
} from "./core/backup";
import { Library, validateLibrary } from "./core/model";
import { readSQLiteBackup } from "./core/sqlite";
import { mistakes, questions } from "./core/learning";
import {
  preferences,
  onBackupChange,
  autoBackup,
  report,
  store,
  useLibrary,
  webdavConfig,
} from "./runtime";
import { escapeMD, WordActions, wordMarkdown } from "./components/word";
import { PracticeSettings } from "./components/practice-settings";
export default function Dashboard() {
  const { lib, loading, refresh } = useLibrary(),
    { push } = useNavigation();
  const [backup, setBackup] = useState<BackupState>(),
    [busy, setBusy] = useState(false),
    [size, setSize] = useState(0);
  const reload = async () => {
    await refresh();
    setBackup(await store.getMeta<BackupState>("webdav"));
    setSize(
      await stat(store.path)
        .then((s) => s.size)
        .catch(() => 0),
    );
  };
  useEffect(() => {
    void reload().catch(report);
  }, []);
  useEffect(
    () =>
      onBackupChange(() => {
        void store.getMeta<BackupState>("webdav").then(setBackup).catch(report);
      }),
    [],
  );
  const active = lib.words.filter((w) => !w.archived),
    reviews = lib.reviews.filter((r) => r.mode !== "copy"),
    wrong = reviews.filter((r) => !r.correct),
    p = preferences();
  let sameTarget = false;
  try {
    sameTarget = backup?.target === target(webdavConfig());
  } catch {
    /* Not configured. */
  }
  const pending =
    !sameTarget ||
    backup?.revision !== lib.revision ||
    backup?.libraryId !== lib.libraryId;
  const stats = `# Learning Overview\n\n| Metric | Count |\n|---|---:|\n| Active words | ${active.length} |\n| Senses | ${active.reduce((n, w) => n + w.senses.length, 0)} |\n| Archived | ${lib.words.length - active.length} |\n| Fuzzy | ${active.filter((w) => w.familiarity === "fuzzy" || w.familiarity === "unknown").length} |\n| Know | ${active.filter((w) => w.familiarity === "known").length} |\n| Included in practice | ${active.filter((w) => w.practice).length} |\n| Recall attempts | ${reviews.length} |\n| Recall mistakes | ${wrong.length} |\n| Copying attempts | ${lib.reviews.length - reviews.length} |\n\n## Practice Dimensions\n\n${(
    ["meaning", "spelling", "gender"] as const
  )
    .map((mode) => {
      const r = reviews.filter((r) => r.mode === mode);
      return `* **${mode}:** ${questions(lib, mode).length} due/new · ${r.length ? r.filter((x) => x.correct).length + " / " + r.length + " correct" : "no attempts"}`;
    })
    .join("\n")}\n\n**Confusion groups:** ${lib.groups.length}`;
  const health = `# Library & Backup\n\n**SQLite** ${(size / 1024 / 1024).toFixed(2)} MB · revision ${lib.revision}\n\n**WebDAV** ${p.webdavUrl ? (pending ? "Backup pending" : "Backed up") : "Not configured"}\n\n**Automatic backup** ${p.autoBackup ? "On" : "Off"}\n\n**Last backup / restore** ${backup?.at ? new Date(backup.at).toLocaleString() : "—"}\n\n${backup?.error ? `**Error** ${escapeMD(backup.error)}\n\n` : ""}**Last full snapshot** ${backup?.fullAt ? new Date(backup.fullAt).toLocaleString() : "—"}\n\n**Latest upload** ${backup?.kind ?? "—"} · ${backup?.increments ?? 0} increments\n\n**Intervals** ${backupPolicy(lib).incrementalMinutes} minutes incremental · ${backupPolicy(lib).fullHours} hours full\n\n${backup?.cleanupPending?.length ? `**Cleanup pending:** ${backup.cleanupPending.length} obsolete increment files.\n\n` : ""}Restore downloads the SQLite snapshot and applies verified JSON increments in order. Full backup publication happens before obsolete increments are deleted. Old full snapshots are retained. Automatic checks run only during plugin activity.\n\nCredentials and audio stay on this computer. A safety copy is created automatically before imports and restores; no manual local backup is required.`;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      await report(e);
    } finally {
      try {
        await reload();
      } catch (error) {
        await report(error);
      }
      setBusy(false);
    }
  };
  const backupActions = (
    <>
      <Action
        title="Create Full SQLite Backup Now"
        icon={Icon.Upload}
        onAction={() =>
          run(async () => {
            const m = await backupRemote(store, webdavConfig(), {
              kind: "full",
              force: true,
            });
            await showToast({
              style: Toast.Style.Success,
              title: "WebDAV backup verified",
              message: `${m.words} words · ${new Date(m.at).toLocaleString()}`,
            });
          })
        }
      />
      <Action
        title="Restore Latest Backup from WebDAV"
        icon={Icon.Download}
        onAction={() =>
          run(async () => {
            const c = webdavConfig(),
              download = await downloadBackup(c);
            push(
              <RestorePreview
                library={download.library}
                source={`WebDAV · ${download.manifest.at}`}
                commit={async () => {
                  await restoreRemote(store, c, download);
                  await reload();
                }}
              />,
            );
          })
        }
      />
      <Action
        title="Verify Remote Snapshot and Increments"
        icon={Icon.CheckCircle}
        onAction={() =>
          run(async () => {
            const { library, manifest } = await downloadBackup(webdavConfig());
            await showToast({
              style: Toast.Style.Success,
              title: "Remote snapshot and increments verified",
              message: `${library.words.length} words · ${new Date(manifest.at).toLocaleString()}`,
            });
          })
        }
      />
      <Action
        title="Export Portable Backup"
        icon={Icon.Document}
        onAction={() => push(<ExportForm />)}
      />
      <Action
        title="Restore from Backup File"
        icon={Icon.Download}
        onAction={() => push(<FileRestore onRestored={reload} />)}
      />
      <Action
        title="Reset Entire Library"
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={() => push(<ResetLibrary onReset={reload} />)}
      />
      <Action.ShowInFinder
        title="Reveal Database Folder"
        path={environment.supportPath}
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
      <Action
        title="Refresh"
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={reload}
      />
    </>
  );
  const top = active
    .map((w) => ({ w, ...mistakes(lib, w.id) }))
    .filter((x) => x.wrong)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 20);
  return (
    <List
      isLoading={loading || busy}
      isShowingDetail
      navigationTitle="Vocabulary Dashboard"
    >
      <List.Item
        title="Learning Overview"
        icon={Icon.BarChart}
        detail={<List.Item.Detail markdown={stats} />}
        actions={<ActionPanel>{backupActions}</ActionPanel>}
      />
      <List.Item
        title="Practice Settings"
        icon={Icon.Gear}
        detail={
          <List.Item.Detail markdown="# Practice Settings\n\nConfigure pronunciation and selected word lists independently for every practice mode." />
        }
        actions={
          <ActionPanel>
            <Action
              title="Configure Practice Modes"
              onAction={() => push(<PracticeSettings onSaved={reload} />)}
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Backup Schedule"
        icon={Icon.Clock}
        detail={
          <List.Item.Detail
            markdown={`# Backup Schedule\n\nIncremental: ${backupPolicy(lib).incrementalMinutes} minutes\n\nFull: ${backupPolicy(lib).fullHours} hours\n\nChecks run during ordinary browsing, editing and practice, not while Raycast is closed. Automatic backup must be enabled in extension preferences.`}
          />
        }
        actions={
          <ActionPanel>
            <Action
              title="Configure Backup Intervals"
              onAction={() => push(<BackupSchedule onSaved={reload} />)}
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Library and Backup Health"
        icon={Icon.HardDrive}
        subtitle={
          !p.webdavUrl
            ? "Not configured"
            : backup?.error && sameTarget
              ? "Backup error"
              : pending
                ? "Backup pending"
                : "Backed up"
        }
        detail={<List.Item.Detail markdown={health} />}
        actions={
          <ActionPanel>
            {backupActions}
            <Action
              title="Clear Audio Cache"
              onAction={() =>
                run(async () => {
                  const ok = await confirmAlert({
                    title: "Clear cached pronunciation audio?",
                    message:
                      "Word data and backups are not affected. Audio will download again as needed.",
                  });
                  if (ok)
                    await rm(join(environment.supportPath, "speech-cache"), {
                      recursive: true,
                      force: true,
                    });
                })
              }
            />
          </ActionPanel>
        }
      />
      <List.Section title="Most Recall Mistakes">
        {top.map(({ w, wrong, total }) => (
          <List.Item
            key={w.id}
            title={w.word}
            accessories={[{ text: `${wrong} / ${total} wrong` }]}
            detail={<List.Item.Detail markdown={wordMarkdown(w, lib)} />}
            actions={
              <ActionPanel>
                <WordActions word={w} refresh={reload} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
function BackupSchedule({ onSaved }: { onSaved: () => Promise<void> }) {
  const { lib, loading } = useLibrary(false);
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  if (loading) return <Form isLoading />;
  const policy = backupPolicy(lib);
  return (
    <Form
      isLoading={busy}
      navigationTitle="Backup Schedule"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Backup Intervals"
            onSubmit={async (values: {
              fullHours: string;
              incrementalMinutes: string;
            }) => {
              if (busy) return;
              const fullHours = Number(values.fullHours),
                incrementalMinutes = Number(values.incrementalMinutes);
              if (
                !Number.isFinite(fullHours) ||
                fullHours < 1 ||
                fullHours > 8760 ||
                !Number.isFinite(incrementalMinutes) ||
                incrementalMinutes < 1 ||
                incrementalMinutes > 1440
              ) {
                await report(
                  Error(
                    "Full interval: 1–8760 hours; incremental interval: 1–1440 minutes.",
                  ),
                );
                return;
              }
              setBusy(true);
              try {
                await store.mutate((lib) => {
                  lib.settings ??= {};
                  lib.settings.backup = { fullHours, incrementalMinutes };
                });
                await onSaved();
                void autoBackup();
                pop();
              } catch (error) {
                await report(error);
              } finally {
                setBusy(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="incrementalMinutes"
        title="Incremental Interval (Minutes)"
        defaultValue={String(policy.incrementalMinutes)}
      />
      <Form.TextField
        id="fullHours"
        title="Full Snapshot Interval (Hours)"
        defaultValue={String(policy.fullHours)}
      />
      <Form.Description text="Automatic backup must be enabled in extension preferences. Activity checks trigger overdue backups; this is not a background timer. Initial backup, missing baseline, oversized increments or 128 increments cause a full snapshot." />
    </Form>
  );
}
function RestorePreview({
  library,
  source,
  commit,
}: {
  library: Library;
  source: string;
  commit: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Detail
      isLoading={busy}
      navigationTitle="Restore Backup Preview"
      markdown={`# Restore Backup\n\n**Source:** ${escapeMD(source)}\n\n**Words:** ${library.words.length}\n\n**Senses:** ${library.words.reduce((n, w) => n + w.senses.length, 0)}\n\n**Groups:** ${library.groups.length}\n\n**Practice records:** ${library.reviews.length}\n\n**Library ID:** ${library.libraryId}\n\nThis replaces the local library; it does not merge. A local safety snapshot is created first. Credentials and preferences remain on this computer.\n\n**No local vocabulary has been changed yet.**`}
      actions={
        <ActionPanel>
          <Action
            title="Replace Local Library from This Backup"
            style={Action.Style.Destructive}
            onAction={async () => {
              if (busy) return;
              if (
                !(await confirmAlert({
                  title: "Replace the local vocabulary library?",
                  message:
                    "The current local library will be saved as a safety snapshot first. This is not a merge.",
                  primaryAction: {
                    title: "Restore Backup",
                    style: Alert.ActionStyle.Destructive,
                  },
                }))
              )
                return;
              setBusy(true);
              try {
                await commit();
                await showToast({
                  style: Toast.Style.Success,
                  title: "Library restored",
                });
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
    />
  );
}
function ExportForm() {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Export Portable Backup"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Export Backup"
            onSubmit={async (v: { folder: string[] }) => {
              try {
                if (!v.folder?.[0]) throw Error("Choose a destination folder.");
                const dest = join(
                  v.folder[0],
                  `french-vocabulary-${Date.now()}.sqlite`,
                );
                await store.exportSQLite(dest);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Backup exported",
                  message: dest,
                });
                pop();
              } catch (e) {
                await report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="folder"
        title="Destination Folder"
        canChooseDirectories
        canChooseFiles={false}
        allowMultipleSelection={false}
      />
      <Form.Description text="Exports all vocabulary, notes, groups, and learning records. Does not export credentials or audio." />
    </Form>
  );
}
function FileRestore({ onRestored }: { onRestored: () => Promise<void> }) {
  const { push } = useNavigation();
  return (
    <Form
      navigationTitle="Restore from File"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Preview Backup"
            onSubmit={async (v: { file: string[] }) => {
              try {
                if (!v.file?.[0])
                  throw Error("Choose a SQLite or legacy JSON backup.");
                if ((await stat(v.file[0])).size > 128 * 1024 * 1024)
                  throw Error("Backup exceeds the 128 MB safety limit.");
                const bytes = await readFile(v.file[0]);
                const library =
                  bytes.subarray(0, 16).toString() === "SQLite format 3\0"
                    ? await readSQLiteBackup(bytes)
                    : JSON.parse(bytes.toString("utf8"));
                validateLibrary(library);
                push(
                  <RestorePreview
                    library={library}
                    source={v.file[0]}
                    commit={async () => {
                      await store.backupLocal("before-file-restore");
                      const current = await store.load();
                      await store.save(
                        library,
                        current.revision,
                        current.libraryId,
                        true,
                      );
                      await onRestored();
                    }}
                  />,
                );
              } catch (e) {
                await report(e);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="SQLite / JSON Backup"
        allowMultipleSelection={false}
        canChooseDirectories={false}
      />
    </Form>
  );
}

function ResetLibrary({ onReset }: { onReset: () => Promise<void> }) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Detail
      isLoading={busy}
      navigationTitle="Reset Entire Library"
      markdown="# Reset Entire Library

This permanently deletes **all local vocabulary, notes, examples, confusion groups, practice inclusion, scheduling cards, and review history**.

Preferences and remote WebDAV backups are not deleted. An automatic local safety copy is created before reset. No automatic backup is triggered by this action."
      actions={
        <ActionPanel>
          <Action
            title="Continue to Final Confirmation"
            style={Action.Style.Destructive}
            onAction={async () => {
              if (busy) return;
              if (
                !(await confirmAlert({
                  title: "Delete the entire local library?",
                  message:
                    "All vocabulary and learning history will be removed. This cannot be undone except by restoring a backup.",
                  primaryAction: {
                    title: "Delete Everything",
                    style: Alert.ActionStyle.Destructive,
                  },
                }))
              )
                return;
              setBusy(true);
              try {
                await store.resetLibrary();
                await onReset();
                await showToast({
                  style: Toast.Style.Success,
                  title: "Local library reset",
                });
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
    />
  );
}
