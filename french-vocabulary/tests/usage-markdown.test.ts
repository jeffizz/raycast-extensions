import test from "node:test";
import assert from "node:assert/strict";
import { usageMarkdown } from "../src/ai/usage-markdown";

test("usage tables show model rows, provider totals and escaped labels", () => {
  const markdown = usageMarkdown({
    deepseek: {
      "model|one": { input: 1000, output: 20, calls: 2, unknown: 1 },
      second: { input: 5, output: 7, calls: 1, unknown: 0 },
    },
  });
  assert.ok(markdown.includes("| Provider Total | 1,005 | 27 | 3 | 1 |"));
  assert.ok(markdown.includes("| model&#124;one | 1,000 | 20 | 2 | 1 |"));
  assert.ok(markdown.includes("Local cache hits are excluded"));
});
test("usage tables handle an empty ledger", () => {
  assert.ok(usageMarkdown({}).includes("No usage recorded."));
});
