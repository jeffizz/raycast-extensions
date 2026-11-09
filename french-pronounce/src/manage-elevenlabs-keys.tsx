import React, { useEffect, useState } from "react";
import { Action, ActionPanel, Alert, Color, confirmAlert, Form, Icon, List, showToast, Toast, useNavigation } from "@raycast/api";
import { randomUUID } from "crypto";
import { updateKeys } from "./state";
import { reactivateKey, type ApiKeyRecord } from "./key-state";

async function report(error: unknown) {
  await showToast({ style: Toast.Style.Failure, title: "Key management failed", message: error instanceof Error ? error.message : "Unknown error" });
}
function date(value?: number): string { return value ? new Date(value).toLocaleString() : "Never"; }

function KeyForm({ record, reload }: { record?: ApiKeyRecord; reload: () => Promise<void> }) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();
  return <Form actions={<ActionPanel><Action.SubmitForm title={record ? "Save Key" : "Add Key"} onSubmit={async (values: { label: string; secret: string; enabled: boolean }) => {
    const label = values.label.trim();
    const secret = (values.secret ?? "").trim();
    if (!label || label.length > 60) { setError("Enter a label of 1–60 characters"); return; }
    if ((!record || secret) && !/^[a-zA-Z0-9_-]{16,256}$/.test(secret)) { setError("Enter a valid API key without spaces"); return; }
    try {
      await updateKeys((state) => {
        if (state.keys.some((key) => key.id !== record?.id && key.secret === (secret || record?.secret))) throw new Error("This key is already saved");
        if (record) {
          const current = state.keys.find((key) => key.id === record.id);
          if (!current) throw new Error("Key was deleted; reopen the list");
          if (secret && secret !== current.secret) {
            Object.assign(current, { id: randomUUID(), secret, createdAt: Date.now(), requests: 0, submittedCharacters: 0, successfulCharacters: 0, failures: 0 });
            reactivateKey(current);
          }
          current.label = label;
          current.enabled = values.enabled;
        } else {
          state.keys.push({ id: randomUUID(), label, secret, enabled: values.enabled, createdAt: Date.now(), requests: 0, submittedCharacters: 0, successfulCharacters: 0, failures: 0, cycleCharacters: 0, cycleFailures: 0 });
        }
      });
      await reload();
      pop();
    } catch (err) { await report(err); }
  }} /></ActionPanel>}>
    <Form.Description text="Keys are stored in Raycast encrypted local storage. No API request is made when saving. Any request error puts the key in a 7-day cooldown, including network/server errors. Use only keys you are authorized to use." />
    <Form.TextField id="label" title="Label" defaultValue={record?.label} placeholder="Personal account" error={error} onChange={() => setError(undefined)} />
    <Form.PasswordField id="secret" title={record ? "Replacement API Key" : "API Key"} placeholder={record ? "Leave blank to keep the saved key" : "Enter API key"} />
    <Form.Checkbox id="enabled" label="Enable this key" defaultValue={record?.enabled ?? true} />
    {record && <Form.Description text="Credentials are never displayed. Replacing a secret resets this entry's identity, statistics and cooldown. Leave blank to keep it. Enabling does not clear cooldown; use Reactivate Now." />}
  </Form>;
}

export default function Command() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  async function reload() {
    try {
      const records = await updateKeys((state) => state.keys.map((key) => ({ ...key })));
      setKeys(records);
      setNow(Date.now());
    } finally { setLoading(false); }
  }
  useEffect(() => {
    reload().catch(report);
    // Visible UI refresh only; expiration is also enforced before every request.
    const timer = setInterval(() => { reload().catch(report); }, 30_000);
    return () => clearInterval(timer);
  }, []);
  async function modify(work: (key: ApiKeyRecord) => void, id: string) {
    try {
      await updateKeys((state) => { const key = state.keys.find((item) => item.id === id); if (key) work(key); });
      await reload();
    } catch (err) { await report(err); }
  }
  const add = <Action.Push title="Add Key" icon={Icon.Plus} shortcut={{ modifiers: ["cmd"], key: "n" }} target={<KeyForm reload={reload} />} />;
  return <List isLoading={loading} isShowingDetail searchBarPlaceholder="Search key labels">
    <List.EmptyView title="No ElevenLabs keys" description="Add a key with ⌘N. Keys are never sent anywhere except api.elevenlabs.io." actions={<ActionPanel>{add}</ActionPanel>} />
    {keys.map((key) => {
      const cooling = !!key.blockedUntil && key.blockedUntil > now;
      const status = !key.enabled ? "Disabled" : cooling ? "Cooling down" : "Active";
      return <List.Item key={key.id} title={key.label} icon={{ source: Icon.Key, tintColor: !key.enabled ? Color.SecondaryText : cooling ? Color.Orange : Color.Green }}
        accessories={[{ text: status }]}
        detail={<List.Item.Detail markdown={"Usage is counted locally for this extension only, not official credits or remaining quota. Submitted characters include failed attempts; cache hits do not count. Reactivation resets current-cycle counters and errors, not lifetime totals. A single error causes a 7-day cooldown.\n\nHTTP 402 does not necessarily mean exhausted credits: inspect the provider code/message below for voice, plan or payment restrictions. Match the model and voice used by the successful playground request, then use Reactivate Now (⌘R).\n\n" + (key.lastError ? `### Last API error\n\n${key.lastError.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&")}` : "No API error recorded.")}
          metadata={<List.Item.Detail.Metadata>
            <List.Item.Detail.Metadata.Label title="Status" text={status} />
            <List.Item.Detail.Metadata.Label title="Retry after" text={key.blockedUntil ? date(key.blockedUntil) : "—"} />
            <List.Item.Detail.Metadata.Separator />
            <List.Item.Detail.Metadata.Label title="Submitted characters (lifetime)" text={String(key.submittedCharacters)} />
            <List.Item.Detail.Metadata.Label title="Successful characters (lifetime)" text={String(key.successfulCharacters)} />
            <List.Item.Detail.Metadata.Label title="Requests / failures (lifetime)" text={`${key.requests} / ${key.failures}`} />
            <List.Item.Detail.Metadata.Label title="Submitted characters (cycle)" text={String(key.cycleCharacters)} />
            <List.Item.Detail.Metadata.Label title="Failures (cycle)" text={String(key.cycleFailures)} />
            <List.Item.Detail.Metadata.Label title="Last used" text={date(key.lastUsedAt)} />
            <List.Item.Detail.Metadata.Label title="Last error" text={key.lastError ?? "None"} />
            <List.Item.Detail.Metadata.Label title="Error time" text={date(key.lastErrorAt)} />
          </List.Item.Detail.Metadata>} />}
        actions={<ActionPanel>
          <Action.Push title="Edit Key Settings" icon={Icon.Pencil} target={<KeyForm record={key} reload={reload} />} />
          {add}
          <Action title="Reactivate Now" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={() => modify((item) => { reactivateKey(item); item.enabled = true; }, key.id)} />
          <Action title={key.enabled ? "Disable Key" : "Enable Key"} onAction={() => modify((item) => { item.enabled = !item.enabled; }, key.id)} />
          <Action title="Refresh Status" onAction={() => reload().catch(report)} />
          <Action title="Delete Key" style={Action.Style.Destructive} shortcut={{ modifiers: ["ctrl"], key: "x" }} onAction={async () => {
            if (!await confirmAlert({ title: "Delete this API key?", message: "Removes the saved secret and its local statistics. Does not revoke the key at ElevenLabs.", primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive } })) return;
            try { await updateKeys((state) => { state.keys = state.keys.filter((item) => item.id !== key.id); }); await reload(); } catch (err) { await report(err); }
          }} />
        </ActionPanel>} />;
    })}
  </List>;
}
