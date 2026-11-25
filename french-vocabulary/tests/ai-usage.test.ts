import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsage } from "../src/ai/usage-normalization";
test("token normalization preserves provider reported counts and unknowns", () => {
  assert.deepEqual(
    normalizeUsage({ prompt_tokens: 10, completion_tokens: 20 }),
    { input: 10, output: 20 },
  );
  assert.deepEqual(normalizeUsage({ input_tokens: 5, output_tokens: 9 }), {
    input: 5,
    output: 9,
  });
  assert.deepEqual(
    normalizeUsage({
      promptTokenCount: 8,
      candidatesTokenCount: 4,
      thoughtsTokenCount: 3,
    }),
    { input: 8, output: 7 },
  );
  assert.deepEqual(normalizeUsage({}), { input: undefined, output: undefined });
  assert.deepEqual(
    normalizeUsage({ prompt_tokens: -1, completion_tokens: "5" }),
    { input: undefined, output: undefined },
  );
});
