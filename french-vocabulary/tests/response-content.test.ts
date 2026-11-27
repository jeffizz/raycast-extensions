import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractResponseContent,
  vocabularyRequestOptions,
} from "../src/ai/response-content";
test("provider text extraction accepts strings and text blocks but never reasoning", () => {
  assert.equal(
    extractResponseContent(
      { choices: [{ message: { content: '{"items":[]}' } }] },
      "deepseek",
    ),
    '{"items":[]}',
  );
  assert.equal(
    extractResponseContent(
      {
        choices: [{ message: { content: [{ type: "text", text: "answer" }] } }],
      },
      "openrouter",
    ),
    "answer",
  );
  assert.equal(
    extractResponseContent(
      {
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "private reasoning" },
                { text: "answer" },
              ],
            },
          },
        ],
      },
      "gemini",
    ),
    "answer",
  );
  assert.throws(
    () =>
      extractResponseContent(
        {
          choices: [
            { message: { content: null, reasoning_content: "private" } },
          ],
        },
        "deepseek",
      ),
    /reasoning but no final/,
  );
  assert.throws(() => extractResponseContent({}, "openai"), /no final text/);
});
test("truncation and refusals have explicit safe errors and never accept partial JSON", () => {
  assert.throws(
    () =>
      extractResponseContent(
        {
          choices: [
            { finish_reason: "length", message: { content: "partial" } },
          ],
        },
        "deepseek",
      ),
    /token limit/,
  );
  assert.throws(
    () =>
      extractResponseContent(
        { candidates: [{ finishReason: "MAX_TOKENS" }] },
        "gemini",
      ),
    /token limit/,
  );
  assert.throws(
    () =>
      extractResponseContent(
        { choices: [{ message: { refusal: "secret payload" } }] },
        "openai",
      ),
    /blocked or refused/,
  );
  assert.throws(
    () =>
      extractResponseContent(
        { promptFeedback: { blockReason: "SAFETY" } },
        "gemini",
      ),
    /blocked or refused/,
  );
});
test("thinking override is DeepSeek-only and Word Family is inside the AI submenu", () => {
  assert.deepEqual(vocabularyRequestOptions("deepseek"), {
    thinking: { type: "disabled" },
  });
  for (const p of ["gemini", "openai", "openrouter"] as const)
    assert.deepEqual(vocabularyRequestOptions(p), {});
  const src = readFileSync(
    new URL("../src/ai/workflow.tsx", import.meta.url),
    "utf8",
  );
  const actions = src.slice(
    src.indexOf("function wordToolMenu"),
    src.indexOf("export function AIWordActions"),
  );
  const submenu = actions.indexOf("<ActionPanel.Submenu");
  const family = actions.indexOf('title="Word Family"');
  const chat = actions.indexOf('title="Chat About This Word"');
  assert.ok(submenu >= 0 && submenu < family && family < chat);
  assert.doesNotMatch(actions.slice(family, chat), /icon=/);
  assert.doesNotMatch(actions, /with AI|Generate /);
  assert.ok(src.includes('["senses", "examples", "mnemonic", "collocations"]'));
  assert.match(actions, /Switch AI Vocabulary Tool/);
  assert.match(
    actions,
    /shortcut=\{\s*current\s*\? \{ modifiers: \["cmd", "shift"\], key: "j" \} : undefined\s*\}/,
  );
  assert.match(actions, /task !== current/);
  assert.match(actions, /allowChat && current !== "chat"/);
  const tool = src.slice(
    src.indexOf("function AIWordTool"),
    src.indexOf("export function AIWorkflow"),
  );
  assert.doesNotMatch(tool, /push\(/);
  assert.match(tool, /setTool\(\{ tool: next, senseId: nextSense \}\)/);
  assert.equal((tool.match(/key=\{tool\}/g) ?? []).length, 3);
});
