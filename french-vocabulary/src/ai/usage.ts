import { LocalStorage } from "@raycast/api";
export type UsageTotals = {
  input: number;
  output: number;
  unknown: number;
  calls: number;
};
export type UsageLedger = Record<string, Record<string, UsageTotals>>;
import { normalizeUsage } from "./usage-normalization";
const key = "ai-token-usage-v1";
let pending: Promise<unknown> = Promise.resolve();
export async function readUsage(): Promise<UsageLedger> {
  return JSON.parse((await LocalStorage.getItem<string>(key)) ?? "{}");
}
export function recordUsage(
  provider: string,
  model: string,
  raw: Record<string, unknown> = {},
) {
  const operation = pending
    .catch(() => {})
    .then(async () => {
      const ledger = await readUsage();
      const group = (ledger[provider] ??= {});
      const total = (group[model] ??= {
        input: 0,
        output: 0,
        unknown: 0,
        calls: 0,
      });
      const usage = normalizeUsage(raw);
      total.input += usage.input ?? 0;
      total.output += usage.output ?? 0;
      total.calls++;
      if (usage.input === undefined || usage.output === undefined)
        total.unknown++;
      await LocalStorage.setItem(key, JSON.stringify(ledger));
    });
  pending = operation;
  return operation;
}
