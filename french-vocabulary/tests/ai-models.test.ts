import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModels, recommendations } from "../src/ai/model-catalog";
import { instruction } from "../src/ai/core";
test("model discovery normalizes IDs and filters non-generation Gemini models", () => {
  assert.deepEqual(
    parseModels("gemini", {
      models: [
        {
          name: "models/gemini-new",
          displayName: "New",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embedding",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
    [{ id: "gemini-new", name: "New" }],
  );
  assert.deepEqual(
    parseModels("openai", {
      data: [{ id: "z" }, { id: "a" }, { id: "a" }, { id: 9 }],
    }),
    [
      { id: "a", name: "a" },
      { id: "z", name: "z" },
    ],
  );
  for (const provider of [
    "openai",
    "gemini",
    "deepseek",
    "openrouter",
  ] as const)
    assert.ok(recommendations[provider].includes("Not selected automatically"));
});
test("history defaults to unverified generation and search is explicit and cache-separated", () => {
  const client = readFileSync(
    new URL("../src/ai/client.ts", import.meta.url),
    "utf8",
  );
  assert.ok(client.includes("searchSources = false"));
  assert.ok(
    client.includes(
      '(task === "history" || task === "mnemonic") && searchSources',
    ),
  );
  assert.ok(client.includes("unverified"));
  assert.match(instruction("history"), /Do not invent stories or source URLs/);
  const settings = readFileSync(
    new URL("../src/ai/settings.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(settings.includes('model: initial?.model ?? ""'));
  assert.ok(settings.includes('title="Refresh Models"'));
  assert.ok(settings.includes('title="Choose Model"'));
  assert.ok(!settings.includes('<Form.TextField title="Model ID"'));
  assert.ok(settings.includes("<ModelPicker"));
});
