import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("model selection is a compact full-width list with official pricing access", () => {
  const source = readFileSync(
    new URL("../src/ai/model-picker.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("isShowingDetail"));
  assert.ok(!source.includes("List.Item.Detail"));
  assert.ok(source.includes('title="Open Official Pricing"'));
  assert.ok(source.includes("assessment.reason"));
  assert.ok(source.includes("modelAssessment"));
  assert.ok(!source.includes("generate("));
  assert.ok(!source.includes("autoAnalyze"));
  assert.ok(!source.includes("apiKey"));
  assert.ok(!source.includes("Choose Analysis Model"));
  for (const host of [
    "developers.openai.com",
    "ai.google.dev",
    "api-docs.deepseek.com",
    "openrouter.ai",
  ])
    assert.ok(source.includes(host));
});
