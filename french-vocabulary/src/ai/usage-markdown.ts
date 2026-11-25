import type { UsageLedger, UsageTotals } from "./usage";

const cell = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/[\r\n]+/g, " ")
    .replace(/[*_`\\[\]]/g, (c) => "&#" + c.charCodeAt(0) + ";");
const number = (value: number) => value.toLocaleString("en-CA");
const row = (name: string, totals: UsageTotals) =>
  "| " +
  cell(name) +
  " | " +
  [totals.input, totals.output, totals.calls, totals.unknown]
    .map(number)
    .join(" | ") +
  " |";
const header =
  "| Model | Input Tokens | Output Tokens | Calls | Unknown Usage |\n| --- | ---: | ---: | ---: | ---: |";

export function usageMarkdown(ledger: UsageLedger): string {
  const sections = Object.entries(ledger).map(([provider, models]) => {
    const total = Object.values(models).reduce(
      (a, b) => ({
        input: a.input + b.input,
        output: a.output + b.output,
        calls: a.calls + b.calls,
        unknown: a.unknown + b.unknown,
      }),
      { input: 0, output: 0, calls: 0, unknown: 0 },
    );
    return (
      "## " +
      cell(provider) +
      "\n\n" +
      header +
      "\n" +
      row("Provider Total", total) +
      "\n" +
      Object.entries(models)
        .map(([model, usage]) => row(model, usage))
        .join("\n")
    );
  });
  return (
    "# AI Token Usage\n\n" +
    (sections.length ? sections.join("\n\n") : "No usage recorded.") +
    "\n\nLocal cache hits are excluded. Unknown Usage counts calls with missing token information; totals include only reported tokens. These statistics are not a bill or subscription balance."
  );
}
