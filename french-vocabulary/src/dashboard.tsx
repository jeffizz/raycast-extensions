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
  Keyboard,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  archiveBeforeReset,
  isResetArchive,
  downloadResetArchive,
  deleteResetArchive,
  listRemoteFiles,
  remoteManifest,
  Manifest,
  RemoteFile,
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
import { modeSettings, practiceModes } from "./core/practice-settings";
import ManageElevenLabsKeys from "./manage-elevenlabs-keys";
import { IndicatorColorSettings } from "./components/indicator-colors";
import { AIUsage } from "./ai/usage-view";
import { AISettings } from "./ai/settings";
import { AIWorkflow } from "./ai/workflow";
import { RemoteWordChatBackups } from "./ai/word-chat-backup-view";
import {
  autoBackupWordChats,
  chatLibraryId,
  wordChats,
} from "./ai/word-chat-runtime";
import { backupWordChats, restoreWordChats } from "./core/word-chat-backup";
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
  const stats = `# Learning Overview\n\n| Metric | Count |\n|---|---:|\n| Fuzzy | ${active.filter((w) => w.familiarity === "fuzzy" || w.familiarity === "unknown").length} |\n| Know | ${active.filter((w) => w.familiarity === "known").length} |\n| Recall attempts | ${reviews.length} |\n| Recall mistakes | ${wrong.length} |\n| Copying attempts | ${lib.reviews.length - reviews.length} |\n\n## Practice Dimensions\n\n${(
    ["meaning", "spelling", "gender"] as const
  )
    .map((mode) => {
      const r = reviews.filter((r) => r.mode === mode);
      return `* **${mode}:** ${questions(lib, mode).length} due/new · ${r.length ? r.filter((x) => x.correct).length + " / " + r.length + " correct" : "no attempts"}`;
    })
    .join("\n")}`;
  const backupStatus = !p.webdavUrl
    ? "Not configured"
    : sameTarget && backup?.error
      ? "Backup error"
      : !sameTarget || !backup?.at
        ? "No Backup Recorded"
        : pending
          ? "Unbacked Changes"
          : "Backed up";
  const tracked = sameTarget ? backup : undefined;
  const libraryOverview = `# Library Overview\n\n| Metric | Count |\n|---|---:|\n| Total words | ${lib.words.length} |\n| Active words | ${active.length} |\n| Archived words | ${lib.words.length - active.length} |\n| Total senses | ${lib.words.reduce((n, w) => n + w.senses.length, 0)} |\n| Active words in practice | ${active.filter((w) => w.practice).length} |\n| Review records | ${lib.reviews.length} |\n| Confusion groups | ${lib.groups.length} |\n\n## Mode-specific Word Lists\n\n${practiceModes.map(({ mode, title }) => `* **${title}:** ${modeSettings(lib, mode).wordIds.length} selected`).join("\n")}\n\n**SQLite:** ${(size / 1024 / 1024).toFixed(2)} MB\n\n**Revision:** ${lib.revision}\n\n**Library ID:** ${escapeMD(lib.libraryId)}\n\nSelected-list membership is separate from card eligibility.`;
  const health = `# Backup & Restore\n\n**Status:** ${backupStatus}\n\n**Automatic backup:** ${p.autoBackup ? "On" : "Off"}\n\n**Last backup / restore:** ${tracked?.at ? new Date(tracked.at).toLocaleString() : "—"}\n\n**Last full snapshot:** ${tracked?.fullAt ? new Date(tracked.fullAt).toLocaleString() : "—"}\n\n**Latest upload:** ${tracked?.kind ?? "—"} · ${tracked?.increments ?? 0} increments\n\n**Intervals:** ${backupPolicy(lib).incrementalMinutes} minutes incremental · ${backupPolicy(lib).fullHours} hours full\n\n**Full snapshots to keep:** ${backupPolicy(lib).retainFull} (including active)\n\n${tracked?.error ? `**Error:** ${escapeMD(tracked.error)}\n\n` : ""}${tracked?.cleanupPending?.length ? `**Cleanup pending:** ${tracked.cleanupPending.length} obsolete files.\n\n` : ""}Use **Browse Remote Files** to inspect the live snapshot, incremental chain, retained snapshots and permanent pre-reset archives, including archive download/delete actions. Unbacked Changes means the local revision differs from the last recorded backup; it does not mean an upload is running. Viewing words also updates activity records. No Backup Recorded means no backup is recorded for this destination. This summary reflects local tracking, not a live server query.\n\nRestore verifies the full snapshot and JSON increments before replacement. Local safety copies are created before restores. Permanent pre-reset archives do not expire automatically. Automatic checks run only during extension activity. Credentials and audio are not backed up.`;

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
  const restoreAction = (
    <Action
      title="Restore from WebDAV"
      icon={Icon.Download}
      onAction={async () => {
        if (busy) return;
        if (
          !(await confirmAlert({
            title: "Download and preview the WebDAV backup?",
            message:
              "This downloads and verifies the remote backup. Local vocabulary will not change until you review the preview and confirm replacement.",
            primaryAction: { title: "Download and Preview" },
          }))
        )
          return;
        await run(async () => {
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
        });
      }}
    />
  );
  useEffect(() => {
    if (!loading && lib.libraryId)
      void autoBackupWordChats(lib.libraryId).catch(() => {});
  }, [loading, lib.libraryId]);
  const backupActions = (
    <>
      <Action
        title="Backup Word Chats"
        icon={Icon.Upload}
        onAction={() =>
          run(async () => {
            const count = await backupWordChats(
              wordChats,
              webdavConfig(),
              await chatLibraryId(),
            );
            await showToast({
              style: Toast.Style.Success,
              title: "Word Chat Backup Complete",
              message: `${count} changed conversations uploaded.`,
            });
          })
        }
      />
      <Action
        title="Restore Word Chats"
        icon={Icon.Download}
        onAction={async () => {
          if (
            busy ||
            !(await confirmAlert({
              title: "Restore Word Chats from WebDAV?",
              message:
                "Restore the vocabulary library first on a new Mac. This imports only missing chats for the current library. Local conversations are not overwritten.",
            }))
          )
            return;
          await run(async () => {
            const result = await restoreWordChats(
              wordChats,
              webdavConfig(),
              await chatLibraryId(),
            );
            await showToast({
              style: result.failed ? Toast.Style.Failure : Toast.Style.Success,
              title: result.failed
                ? "Word Chat Restore Incomplete"
                : "Word Chat Restore Complete",
              message: `Restored: ${result.restored}. Skipped: ${result.skipped}. Failed: ${result.failed}.`,
            });
          });
        }}
      />
      <Action
        title="Manual Full Backup"
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
      {restoreAction}
      <Action
        title="Check Remote Backup Health"
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
        title="Use Local Library as New Backup"
        icon={Icon.Upload}
        onAction={async () => {
          if (
            busy ||
            !(await confirmAlert({
              title: "Use the local library as the new remote backup?",
              message:
                "The current local library stays unchanged. The existing remote backup will be verified and preserved as a permanent SQLite archive before publishing a new full backup. This can consume additional remote storage. If verification fails, recovery stops.",
              primaryAction: {
                title: "Back Up Local Library",
                style: Alert.ActionStyle.Destructive,
              },
            }))
          )
            return;
          await run(async () => {
            await backupRemote(store, webdavConfig(), {
              kind: "full",
              force: true,
              useLocal: true,
            });
            await showToast({
              style: Toast.Style.Success,
              title: "Backup connection re-established",
              message:
                "Local library backed up; previous remote state preserved.",
            });
          });
        }}
      />
      <Action
        title="Export Backup File"
        icon={Icon.Document}
        onAction={() => push(<ExportForm />)}
      />
      <Action
        title="Restore from Backup File"
        icon={Icon.Download}
        onAction={() => push(<FileRestore onRestored={reload} />)}
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
      <Action
        title="Refresh"
        shortcut={Keyboard.Shortcut.Common.Refresh}
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
      <List.Section title="Library & Learning">
        <List.Item
          title="Learning Overview"
          icon={Icon.BarChart}
          detail={<List.Item.Detail markdown={stats} />}
          actions={
            <ActionPanel>
              <Action title="Refresh" onAction={reload} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Library Overview"
          icon={Icon.HardDrive}
          detail={<List.Item.Detail markdown={libraryOverview} />}
          actions={
            <ActionPanel>
              <Action title="Refresh" onAction={reload} />
              <Action.ShowInFinder
                title="Reveal Database Folder"
                path={environment.supportPath}
              />
              {restoreAction}
              <Action
                title="Reset Entire Library"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => push(<ResetLibrary onReset={reload} />)}
              />

              <Action
                title="Clear Audio Cache"
                onAction={() =>
                  run(async () => {
                    const ok = await confirmAlert({
                      title: "Clear cached pronunciation audio?",
                      message:
                        "Word data and backups are not affected. Frdic and ElevenLabs audio will download again as needed; ElevenLabs downloads may consume credits.",
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
        <List.Item
          title="Backup & Restore"
          icon={Icon.Cloud}
          subtitle={backupStatus}
          detail={<List.Item.Detail markdown={health} />}
          actions={
            <ActionPanel>
              <Action
                title="Browse Remote Files"
                onAction={() => push(<RemoteBackupStatus />)}
              />
              <Action.Push
                title="Browse Remote Word Chat Backups"
                target={<RemoteWordChatBackups words={lib.words} />}
              />
              <Action
                title="Backup Settings"
                icon={Icon.Gear}
                onAction={() => push(<BackupSchedule onSaved={reload} />)}
              />
              {backupActions}
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="AI Vocabulary">
        <List.Item
          title="AI Token Usage"
          icon={Icon.BarChart}
          actions={
            <ActionPanel>
              <Action
                title="View AI Token Usage"
                onAction={() => push(<AIUsage />)}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="AI Settings & Keys"
          icon={Icon.Key}
          actions={
            <ActionPanel>
              <Action
                title="Open AI Settings"
                onAction={() => push(<AISettings />)}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Add Vocabulary with AI"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action
                title="Add Vocabulary with AI"
                onAction={() => push(<AIWorkflow />)}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Pronunciation">
        <List.Item
          title="Manage ElevenLabs Keys"
          icon={Icon.Key}
          detail={
            <List.Item.Detail
              markdown={
                "# ElevenLabs Keys\n\nManage API keys, weights, enabled status and local usage. Keys stay in encrypted local storage and are excluded from library backups.\n\nConfigure the Frdic / ElevenLabs ratio, voices and model in extension preferences."
              }
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Manage ElevenLabs Keys"
                icon={Icon.Key}
                onAction={() => push(<ManageElevenLabsKeys />)}
              />
              <Action
                title="Open Pronunciation Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Personalization">
        <List.Item
          title="Content Indicator Colours"
          icon={Icon.Gear}
          actions={
            <ActionPanel>
              <Action
                title="Configure Colours"
                onAction={() =>
                  push(<IndicatorColorSettings onSaved={reload} />)
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>
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
function RemoteBackupStatus() {
  const { push } = useNavigation();
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [manifest, setManifest] = useState<Manifest>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [checked, setChecked] = useState("");
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const config = webdavConfig();
      const results = await Promise.allSettled([
        remoteManifest(config),
        listRemoteFiles(config),
      ]);
      setManifest(
        results[0].status === "fulfilled"
          ? results[0].value.manifest
          : undefined,
      );
      setFiles(results[1].status === "fulfilled" ? results[1].value : []);
      setError(
        results
          .filter((r) => r.status === "rejected")
          .map((r) => (r.status === "rejected" ? String(r.reason) : ""))
          .join("\n"),
      );
      setChecked(new Date().toLocaleString());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const fileRank = (name: string) =>
    name === "latest.json"
      ? 0
      : manifest?.increments?.some((d) => d.file === name)
        ? 1
        : name === manifest?.file
          ? 2
          : isResetArchive(name)
            ? 5
            : manifest?.fullHistory?.includes(name)
              ? 4
              : 3;
  const sortedFiles = [...files].sort(
    (a, b) =>
      fileRank(a.name) - fileRank(b.name) || a.name.localeCompare(b.name),
  );
  const role = (name: string) =>
    isResetArchive(name)
      ? "Permanent pre-reset archive"
      : name === "latest.json"
        ? "Backup index"
        : name === manifest?.file
          ? "Active full snapshot"
          : manifest?.increments?.some((d) => d.file === name)
            ? "Active increment"
            : manifest?.fullHistory?.includes(name)
              ? "Retained full snapshot"
              : "Untracked file (not automatically deleted)";
  const actions = (
    <ActionPanel>
      <Action
        title="Refresh Remote Status"
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
    </ActionPanel>
  );
  return (
    <List
      isLoading={busy}
      isShowingDetail
      navigationTitle="Backup Status & Remote Files"
      actions={actions}
    >
      <List.Item
        title="Remote Backup Overview"
        detail={
          <List.Item.Detail
            markdown={`# Remote Backup\n\nChecked: ${checked || "—"}\n\n${error ? escapeMD(error) + "\n\n" : ""}${manifest ? `Revision: ${manifest.revision}\n\nLast backup: ${new Date(manifest.at).toLocaleString()}\n\nActive snapshot: ${escapeMD(manifest.file)}\n\nActive increments: ${manifest.increments?.length ?? 0}\n\nTracked full snapshots: ${manifest.fullHistory?.length ?? 1}` : "No readable backup index."}\n\nListed files: ${files.length}\n\nThis view reads metadata only; it does not verify file contents or change remote files.`}
          />
        }
        actions={actions}
      />
      {sortedFiles.map((file) => (
        <List.Item
          key={file.name}
          title={file.name}
          subtitle={role(file.name)}
          detail={
            <List.Item.Detail
              markdown={`# ${escapeMD(file.name)}\n\n${role(file.name)}\n\nSize: ${file.size === undefined ? "Unknown" : (file.size / 1024 / 1024).toFixed(2) + " MB"}\n\nModified: ${file.modified && Number.isFinite(Date.parse(file.modified)) ? new Date(file.modified).toLocaleString() : "Unknown"}`}
            />
          }
          actions={
            isResetArchive(file.name) ? (
              <ActionPanel>
                <Action
                  title="Download Reset Archive"
                  onAction={() =>
                    push(<DownloadResetArchive file={file.name} />)
                  }
                />
                <Action
                  title="Delete Reset Archive Permanently"
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    if (
                      !(await confirmAlert({
                        title: "Permanently delete this reset archive?",
                        message: file.name,
                        primaryAction: {
                          title: "Delete Archive",
                          style: Alert.ActionStyle.Destructive,
                        },
                      }))
                    )
                      return;
                    try {
                      await deleteResetArchive(webdavConfig(), file.name);
                      await refresh();
                    } catch (e) {
                      await report(e);
                    }
                  }}
                />
                <Action title="Refresh Remote Status" onAction={refresh} />
              </ActionPanel>
            ) : (
              actions
            )
          }
        />
      ))}
    </List>
  );
}
function DownloadResetArchive({ file }: { file: string }) {
  const { pop } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Form
      isLoading={busy}
      navigationTitle="Download Reset Archive"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Download Archive"
            onSubmit={async (values: { folder: string[] }) => {
              if (busy) return;
              setBusy(true);
              try {
                if (!values.folder?.[0])
                  throw Error("Choose a destination folder.");
                const bytes = await downloadResetArchive(webdavConfig(), file);
                const path = join(values.folder[0], file);
                await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
                await showToast({
                  style: Toast.Style.Success,
                  title: "Archive downloaded",
                  message: path,
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
    >
      <Form.FilePicker
        id="folder"
        title="Destination Folder"
        canChooseDirectories
        canChooseFiles={false}
        allowMultipleSelection={false}
      />
      <Form.Description text="Download and verify the standalone SQLite archive. Existing files are never overwritten. Restore it using Restore from Backup File." />
    </Form>
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
      navigationTitle="Backup Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Backup Settings"
            onSubmit={async (values: {
              fullHours: string;
              incrementalMinutes: string;
              retainFull: string;
            }) => {
              if (busy) return;
              const fullHours = Number(values.fullHours),
                incrementalMinutes = Number(values.incrementalMinutes),
                retainFull = Number(values.retainFull);
              if (
                !Number.isFinite(fullHours) ||
                fullHours < 1 ||
                fullHours > 8760 ||
                !Number.isFinite(incrementalMinutes) ||
                incrementalMinutes < 1 ||
                incrementalMinutes > 1440 ||
                !Number.isSafeInteger(retainFull) ||
                retainFull < 1 ||
                retainFull > 100
              ) {
                await report(
                  Error(
                    "Full interval: 1–8760 hours; incremental interval: 1–1440 minutes; retained full snapshots: 1–100.",
                  ),
                );
                return;
              }
              setBusy(true);
              try {
                await store.mutate((lib) => {
                  lib.settings ??= {};
                  lib.settings.backup = {
                    fullHours,
                    incrementalMinutes,
                    retainFull,
                  };
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
      <Form.TextField
        id="retainFull"
        title="Full Snapshots to Keep"
        defaultValue={String(policy.retainFull)}
      />
      <Form.Description text="Retention includes the active snapshot. Only snapshots tracked by the backup index are pruned after successful publication; older untracked files are left untouched." />
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

Before reset, a full WebDAV backup and a verified permanent permanent-backup SQLite copy are required. If backup fails or WebDAV is not configured, reset is cancelled. Archives do not expire automatically; manage them under Backup Status & Remote Files. A local safety copy is also created."
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
                const archive = await archiveBeforeReset(store, webdavConfig());
                await store.resetLibrary(archive);
                await store.setMeta("backup-baseline", null);
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
